import { getConnection } from './solana/connection';
import { getWalletPublicKey } from './solana/wallet';
import { checkBalance } from './utils/helpers';
import { logger } from './utils/logger';
import { loadConfig } from './utils/config';
import { scanForArbitrage, generateDynamicTriangles, fetchPoolAddresses } from './arbitrage/arbitrageScanner';  // Добавлен импорт fetchPoolAddresses для TS2304
import { executeArbitrage } from './arbitrage/executor';
import { startBot, sendNotification } from './telegram/bot';
import { setupHeliusWebhook } from './solana/connection';  // Для реал-тайм
import express, { Request, Response } from 'express';  // Добавлены типы Request/Response для TS7006
import { Server } from 'http';
import { exec } from 'child_process';  // Добавлено для авто-запуска LocalTunnel

// Глобальные переменные (для состояния)
let isRunning = true;  // Управляется через Telegram
let chatId: string | null = null;  // ID чата для уведомлений (установите из Telegram ctx)

// Placeholder: Адреса пулов для мониторинга (будет обновлено динамически)
let MONITORED_ACCOUNTS: string[] = [];

/**
 * Авто-запуск LocalTunnel и получение URL.
 * @returns {Promise<string>} LocalTunnel URL.
 */
async function startLocalTunnel(): Promise<string> {
    return new Promise((resolve, reject) => {
        const ltProcess = exec('lt --port 3000', (error, stdout, stderr) => {
            if (error) {
                logger.error(`LocalTunnel error: ${error}`);
                reject(error);
            }
            if (stderr) logger.warn(`LocalTunnel stderr: ${stderr}`);
        });

        ltProcess.stdout?.on('data', (data) => {
            const match = data.match(/your url is: (https:\/\/.*)/);
            if (match) {
                const url = match[1].trim();
                logger.info(`LocalTunnel URL: ${url}`);
                resolve(url);
            }
        });

        ltProcess.on('close', (code) => {
            if (code !== 0) reject(new Error(`LocalTunnel exited with code ${code}`));
        });
    });
}

/**
 * Основная функция запуска бота.
 */
async function main() {
    const config = loadConfig();
    const connection = getConnection();
    const wallet = getWalletPublicKey();

    // Запуск Telegram-бота
    await startBot();

    // Авто-запуск LocalTunnel и получение URL
    let webhookUrl = 'http://localhost:3000/webhook';  // Fallback
    try {
        const ltUrl = await startLocalTunnel();
        webhookUrl = `${ltUrl}/webhook`;
    } catch (error) {
        logger.warn('Failed to start LocalTunnel - using localhost (webhooks may not work externally)');
    }

    // Авто-fetch пулов и настройка вебхука
    const triangles = await generateDynamicTriangles();  // Сначала генерируем triangles
    MONITORED_ACCOUNTS = await fetchPoolAddresses(triangles);  // Затем fetch пулов
    await setupHeliusWebhook(MONITORED_ACCOUNTS, webhookUrl);

    // Запуск сервера для обработки вебхуков (Express для простоты)
    const app = express();
    app.use(express.json());
    app.post('/webhook', async (req: Request, res: Response) => {  // Типизация req/res для TS7006
        const data = req.body;  // Данные от Helius (e.g. tx changes)
        logger.info(`Webhook received: ${JSON.stringify(data)}`);
        // Trigger сканирование при изменении
        await performArbitrageScan();
        res.status(200).send('OK');
    });
    const server: Server = app.listen(3000, () => logger.info('Webhook server running on port 3000'));

    // Основной цикл сканирования (setInterval для периодичности)
    const scanInterval = setInterval(async () => {
        if (!isRunning) {
            logger.info('Scan skipped: bot not running');  // Добавлено для видимости
            return;
        }

        logger.info('Starting periodic scan...');  // Добавлено для видимости

        // Мониторинг баланса (авто-стоп)
        if (!(await checkBalance(connection, wallet, config.minBalance))) {
            isRunning = false;
            if (chatId) sendNotification(chatId, 'Авто-стоп: низкий баланс!');
            return;
        }

        await performArbitrageScan();
        logger.info('Periodic scan completed');  // Добавлено
    }, config.scanInterval);

    // Graceful shutdown
    process.on('SIGINT', () => {
        clearInterval(scanInterval);
        server.close();
        logger.info('Bot shutdown');
        process.exit(0);
    });
}

/**
 * Выполняет сканирование и арбитраж (с параллелизмом для нескольких треугольников).
 */
async function performArbitrageScan() {
    // Авто-генерация треугольников перед сканом (минимизирует ручное)
    await generateDynamicTriangles();  // Вызов (обновит config.triangles если нужно; логика в scanForArbitrage)

    const opportunity = await scanForArbitrage();
    if (opportunity) {
        logger.info(`Processing opportunity: ${opportunity.triangle.join('->')}`);
        if (loadConfig().testMode) {
            logger.info('Test mode: Simulating only');
            return;
        }
        const signature = await executeArbitrage(opportunity.triangle);
        if (signature && chatId) {
            sendNotification(chatId, `Успешная сделка: ${opportunity.triangle.join('->')}, прибыль ${opportunity.profit}, sig: ${signature}`);
        }
    }
}

// Запуск
main().catch(error => {
    logger.error(`Fatal error: ${error}`);
    process.exit(1);
});