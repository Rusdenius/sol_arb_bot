import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { logger } from '../utils/logger';
import { retry } from '../utils/helpers';
import { RPC_ENDPOINT, HELIUS_API_KEY, loadConfig } from '../utils/config';  // Добавлен loadConfig для network

/**
 * Создаёт и возвращает соединение с Solana RPC.
 * @returns {Connection} Объект соединения.
 */
export function getConnection(): Connection {
    const config = loadConfig();
    const network = config.network;

    // Комментарий: Динамический endpoint на основе network (без ручной замены)
    let endpoint: string;
    if (network === 'devnet') {
        endpoint = HELIUS_API_KEY ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}` : 'https://api.devnet.solana.com';
    } else {
        endpoint = HELIUS_API_KEY ? `https://rpc.helius.xyz/?api-key=${HELIUS_API_KEY}` : RPC_ENDPOINT;
    }
    const connection = new Connection(endpoint, 'confirmed');
    logger.info(`Connected to Solana RPC: ${endpoint} (${network})`);
    return connection;
}

/**
 * Настраивает вебхук Helius для реал-тайм мониторинга изменений в аккаунтах (пулах DEX).
 * @param {string[]} accountAddresses - Массив адресов для мониторинга (e.g. пулы Raydium).
 * @param {string} webhookUrl - URL твоего сервера для получения уведомлений (нужно настроить отдельно).
 * @returns {Promise<string>} ID вебхука.
 */
export async function setupHeliusWebhook(accountAddresses: string[], webhookUrl: string): Promise<string> {
    const config = loadConfig();
    const network = config.network;

    // Динамический URL для Helius (mainnet или devnet)
    const apiUrl = network === 'devnet' ? `https://devnet.helius-rpc.com/v0/webhooks?api-key=${HELIUS_API_KEY}` : `https://api.helius.xyz/v0/webhooks?api-key=${HELIUS_API_KEY}`;

    // Комментарий: Helius бесплатные вебхуки для уведомлений об изменениях (ускоряет детекцию арбитража).
    const payload = {
        webhookURL: webhookUrl,
        transactionTypes: ['SWAP'],  // Мониторим свопы
        accountAddresses: accountAddresses.map(addr => new PublicKey(addr).toBase58()),
        webhookType: 'enhanced'  // Бесплатный tier
    };
    try {
        const response = await retry(() => axios.post(apiUrl, payload));
        logger.info(`Webhook created: ${response.data.webhookID} for ${network}`);
        return response.data.webhookID;
    } catch (error) {
        logger.error(`Failed to setup webhook: ${error}`);
        throw error;
    }
}

// ... Функция для обработки входящих вебхуков (добавим в index.ts позже)