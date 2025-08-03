"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConnection = getConnection;
exports.setupHeliusWebhook = setupHeliusWebhook;
const web3_js_1 = require("@solana/web3.js");
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
const helpers_1 = require("../utils/helpers");
const config_1 = require("../utils/config"); // Добавлен loadConfig для network
/**
 * Создаёт и возвращает соединение с Solana RPC.
 * @returns {Connection} Объект соединения.
 */
function getConnection() {
    const config = (0, config_1.loadConfig)();
    const network = config.network;
    // Комментарий: Динамический endpoint на основе network (без ручной замены)
    let endpoint;
    if (network === 'devnet') {
        endpoint = config_1.HELIUS_API_KEY ? `https://devnet.helius-rpc.com/?api-key=${config_1.HELIUS_API_KEY}` : 'https://api.devnet.solana.com';
    }
    else {
        endpoint = config_1.HELIUS_API_KEY ? `https://rpc.helius.xyz/?api-key=${config_1.HELIUS_API_KEY}` : config_1.RPC_ENDPOINT;
    }
    const connection = new web3_js_1.Connection(endpoint, 'confirmed');
    logger_1.logger.info(`Connected to Solana RPC: ${endpoint} (${network})`);
    return connection;
}
/**
 * Настраивает вебхук Helius для реал-тайм мониторинга изменений в аккаунтах (пулах DEX).
 * @param {string[]} accountAddresses - Массив адресов для мониторинга (e.g. пулы Raydium).
 * @param {string} webhookUrl - URL твоего сервера для получения уведомлений (нужно настроить отдельно).
 * @returns {Promise<string>} ID вебхука.
 */
async function setupHeliusWebhook(accountAddresses, webhookUrl) {
    const config = (0, config_1.loadConfig)();
    const network = config.network;
    // Динамический URL для Helius (mainnet или devnet)
    const apiUrl = network === 'devnet' ? `https://devnet.helius-rpc.com/v0/webhooks?api-key=${config_1.HELIUS_API_KEY}` : `https://api.helius.xyz/v0/webhooks?api-key=${config_1.HELIUS_API_KEY}`;
    // Комментарий: Helius бесплатные вебхуки для уведомлений об изменениях (ускоряет детекцию арбитража).
    const payload = {
        webhookURL: webhookUrl,
        transactionTypes: ['SWAP'], // Мониторим свопы
        accountAddresses: accountAddresses.map(addr => new web3_js_1.PublicKey(addr).toBase58()),
        webhookType: 'enhanced' // Бесплатный tier
    };
    try {
        const response = await (0, helpers_1.retry)(() => axios_1.default.post(apiUrl, payload));
        logger_1.logger.info(`Webhook created: ${response.data.webhookID} for ${network}`);
        return response.data.webhookID;
    }
    catch (error) {
        logger_1.logger.error(`Failed to setup webhook: ${error}`);
        throw error;
    }
}
// ... Функция для обработки входящих вебхуков (добавим в index.ts позже)
