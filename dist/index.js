"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const connection_1 = require("./solana/connection");
const wallet_1 = require("./solana/wallet");
const helpers_1 = require("./utils/helpers");
const logger_1 = require("./utils/logger");
const config_1 = require("./utils/config");
const arbitrageScanner_1 = require("./arbitrage/arbitrageScanner"); // Добавлен импорт fetchPoolAddresses для TS2304
const executor_1 = require("./arbitrage/executor");
const bot_1 = require("./telegram/bot");
const connection_2 = require("./solana/connection"); // Для реал-тайм
const express_1 = __importDefault(require("express")); // Добавлены типы Request/Response для TS7006
const child_process_1 = require("child_process"); // Добавлено для авто-запуска LocalTunnel
// Глобальные переменные (для состояния)
let isRunning = true; // Управляется через Telegram
let chatId = null; // ID чата для уведомлений (установите из Telegram ctx)
// Placeholder: Адреса пулов для мониторинга (будет обновлено динамически)
let MONITORED_ACCOUNTS = [];
/**
 * Авто-запуск LocalTunnel и получение URL.
 * @returns {Promise<string>} LocalTunnel URL.
 */
async function startLocalTunnel() {
    return new Promise((resolve, reject) => {
        const ltProcess = (0, child_process_1.exec)('lt --port 3000', (error, stdout, stderr) => {
            if (error) {
                logger_1.logger.error(`LocalTunnel error: ${error}`);
                reject(error);
            }
            if (stderr)
                logger_1.logger.warn(`LocalTunnel stderr: ${stderr}`);
        });
        ltProcess.stdout?.on('data', (data) => {
            const match = data.match(/your url is: (https:\/\/.*)/);
            if (match) {
                const url = match[1].trim();
                logger_1.logger.info(`LocalTunnel URL: ${url}`);
                resolve(url);
            }
        });
        ltProcess.on('close', (code) => {
            if (code !== 0)
                reject(new Error(`LocalTunnel exited with code ${code}`));
        });
    });
}
/**
 * Основная функция запуска бота.
 */
async function main() {
    const config = (0, config_1.loadConfig)();
    const connection = (0, connection_1.getConnection)();
    const wallet = (0, wallet_1.getWalletPublicKey)();
    // Запуск Telegram-бота
    await (0, bot_1.startBot)();
    // Авто-запуск LocalTunnel и получение URL
    let webhookUrl = 'http://localhost:3000/webhook'; // Fallback
    try {
        const ltUrl = await startLocalTunnel();
        webhookUrl = `${ltUrl}/webhook`;
    }
    catch (error) {
        logger_1.logger.warn('Failed to start LocalTunnel - using localhost (webhooks may not work externally)');
    }
    // Авто-fetch пулов и настройка вебхука
    const triangles = await (0, arbitrageScanner_1.generateDynamicTriangles)(); // Сначала генерируем triangles
    MONITORED_ACCOUNTS = await (0, arbitrageScanner_1.fetchPoolAddresses)(triangles); // Затем fetch пулов
    await (0, connection_2.setupHeliusWebhook)(MONITORED_ACCOUNTS, webhookUrl);
    // Запуск сервера для обработки вебхуков (Express для простоты)
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.post('/webhook', async (req, res) => {
        const data = req.body; // Данные от Helius (e.g. tx changes)
        logger_1.logger.info(`Webhook received: ${JSON.stringify(data)}`);
        // Trigger сканирование при изменении
        await performArbitrageScan();
        res.status(200).send('OK');
    });
    const server = app.listen(3000, () => logger_1.logger.info('Webhook server running on port 3000'));
    // Основной цикл сканирования (setInterval для периодичности)
    const scanInterval = setInterval(async () => {
        if (!isRunning) {
            logger_1.logger.info('Scan skipped: bot not running'); // Добавлено для видимости
            return;
        }
        logger_1.logger.info('Starting periodic scan...'); // Добавлено для видимости
        // Мониторинг баланса (авто-стоп)
        if (!(await (0, helpers_1.checkBalance)(connection, wallet, config.minBalance))) {
            isRunning = false;
            if (chatId)
                (0, bot_1.sendNotification)(chatId, 'Авто-стоп: низкий баланс!');
            return;
        }
        await performArbitrageScan();
        logger_1.logger.info('Periodic scan completed'); // Добавлено
    }, config.scanInterval);
    // Graceful shutdown
    process.on('SIGINT', () => {
        clearInterval(scanInterval);
        server.close();
        logger_1.logger.info('Bot shutdown');
        process.exit(0);
    });
}
/**
 * Выполняет сканирование и арбитраж (с параллелизмом для нескольких треугольников).
 */
async function performArbitrageScan() {
    // Авто-генерация треугольников перед сканом (минимизирует ручное)
    await (0, arbitrageScanner_1.generateDynamicTriangles)(); // Вызов (обновит config.triangles если нужно; логика в scanForArbitrage)
    const opportunity = await (0, arbitrageScanner_1.scanForArbitrage)();
    if (opportunity) {
        logger_1.logger.info(`Processing opportunity: ${opportunity.triangle.join('->')}`);
        if ((0, config_1.loadConfig)().testMode) {
            logger_1.logger.info('Test mode: Simulating only');
            return;
        }
        const signature = await (0, executor_1.executeArbitrage)(opportunity.triangle);
        if (signature && chatId) {
            (0, bot_1.sendNotification)(chatId, `Успешная сделка: ${opportunity.triangle.join('->')}, прибыль ${opportunity.profit}, sig: ${signature}`);
        }
    }
}
// Запуск
main().catch(error => {
    logger_1.logger.error(`Fatal error: ${error}`);
    process.exit(1);
});
