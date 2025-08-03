import { logger } from '../utils/logger';
import { loadConfig } from '../utils/config';
import { getMintBySymbol } from './arbitrageScanner';  // Переиспользование

/**
 * Проверяет безопасность контракта (токена) только по Whitelist (RugCheck удалён).
 * @param {string} tokenSymbol - Символ токена.
 * @returns {Promise<boolean>} True если safe.
 */
export async function checkContractSafety(tokenSymbol: string): Promise<boolean> {
    const config = loadConfig();
    const mint = getMintBySymbol(tokenSymbol).toBase58();

    // Комментарий: Только whitelist для простоты (KISS, без внешних API).
    if (config.whitelist.includes(mint)) {
        logger.info(`Token ${tokenSymbol} in whitelist - safe`);
        return true;
    } else {
        logger.warn(`Token ${tokenSymbol} not in whitelist - skipped`);
        return false;
    }
}