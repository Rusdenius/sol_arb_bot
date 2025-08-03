"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateNetProfit = calculateNetProfit;
exports.retry = retry;
exports.checkBalance = checkBalance;
const bottleneck_1 = __importDefault(require("bottleneck"));
const logger_1 = require("./logger");
// Rate limiter (ограничение: 10 запросов/сек для Helius бесплатного tier)
const limiter = new bottleneck_1.default({ minTime: 100 }); // 100ms между запросами
/**
 * Расчитывает прибыль с учётом комиссий.
 * @param {number} grossProfit - Валовая прибыль.
 * @param {number} fees - Комиссии (network + swap).
 * @returns {number} Чистая прибыль.
 */
function calculateNetProfit(grossProfit, fees) {
    // Комментарий: Простой расчёт, учитываем 0.5% своп-фис + network fee.
    return grossProfit - fees;
}
/**
 * Retry-механизм с экспоненциальной backoff.
 * @param {() => Promise<T>} fn - Функция для выполнения.
 * @param {number} retries - Кол-во попыток.
 * @returns {Promise<T>} Результат.
 */
async function retry(fn, retries = 3) {
    let attempt = 0;
    while (attempt < retries) {
        try {
            return await limiter.schedule(fn); // С rate limiting
        }
        catch (error) {
            attempt++;
            const delay = Math.pow(2, attempt) * 1000; // Экспоненциальная задержка
            logger_1.logger.warn(`Retry ${attempt}/${retries} after ${delay}ms: ${error}`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error('Max retries exceeded');
}
/**
 * Проверяет баланс и авто-стоп.
 * @param {Connection} connection - Solana connection.
 * @param {PublicKey} wallet - Адрес кошелька.
 * @param {number} minBalance - Минимальный баланс.
 * @returns {boolean} True если баланс OK.
 */
async function checkBalance(connection, wallet, minBalance) {
    const balance = await retry(() => connection.getBalance(wallet));
    if (balance / 1e9 < minBalance) { // Конверт в SOL
        logger_1.logger.error(`Low balance: ${balance / 1e9} SOL < ${minBalance}`);
        return false;
    }
    return true;
}
// ... Другие helpers, например, для кэширования цен (добавим в следующей части если нужно)
