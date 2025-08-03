import Bottleneck from 'bottleneck';
import {Connection, PublicKey, VersionedTransaction} from '@solana/web3.js';
import { logger } from './logger';

// Rate limiter (ограничение: 10 запросов/сек для Helius бесплатного tier)
const limiter = new Bottleneck({ minTime: 100 });  // 100ms между запросами

/**
 * Расчитывает прибыль с учётом комиссий.
 * @param {number} grossProfit - Валовая прибыль.
 * @param {number} fees - Комиссии (network + swap).
 * @returns {number} Чистая прибыль.
 */
export function calculateNetProfit(grossProfit: number, fees: number): number {
    // Комментарий: Простой расчёт, учитываем 0.5% своп-фис + network fee.
    return grossProfit - fees;
}

/**
 * Retry-механизм с экспоненциальной backoff.
 * @param {() => Promise<T>} fn - Функция для выполнения.
 * @param {number} retries - Кол-во попыток.
 * @returns {Promise<T>} Результат.
 */
export async function retry<T>(fn: () => Promise<T>, retries: number = 3): Promise<T> {
    let attempt = 0;
    while (attempt < retries) {
        try {
            return await limiter.schedule(fn);  // С rate limiting
        } catch (error) {
            attempt++;
            const delay = Math.pow(2, attempt) * 1000;  // Экспоненциальная задержка
            logger.warn(`Retry ${attempt}/${retries} after ${delay}ms: ${error}`);
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
export async function checkBalance(connection: Connection, wallet: PublicKey, minBalance: number): Promise<boolean> {
    const balance = await retry(() => connection.getBalance(wallet));
    if (balance / 1e9 < minBalance) {  // Конверт в SOL
        logger.error(`Low balance: ${balance / 1e9} SOL < ${minBalance}`);
        return false;
    }
    return true;
}

// ... Другие helpers, например, для кэширования цен (добавим в следующей части если нужно)