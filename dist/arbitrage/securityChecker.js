"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkContractSafety = checkContractSafety;
const logger_1 = require("../utils/logger");
const config_1 = require("../utils/config");
const arbitrageScanner_1 = require("./arbitrageScanner"); // Переиспользование
/**
 * Проверяет безопасность контракта (токена) только по Whitelist (RugCheck удалён).
 * @param {string} tokenSymbol - Символ токена.
 * @returns {Promise<boolean>} True если safe.
 */
async function checkContractSafety(tokenSymbol) {
    const config = (0, config_1.loadConfig)();
    const mint = (0, arbitrageScanner_1.getMintBySymbol)(tokenSymbol).toBase58();
    // Комментарий: Только whitelist для простоты (KISS, без внешних API).
    if (config.whitelist.includes(mint)) {
        logger_1.logger.info(`Token ${tokenSymbol} in whitelist - safe`);
        return true;
    }
    else {
        logger_1.logger.warn(`Token ${tokenSymbol} not in whitelist - skipped`);
        return false;
    }
}
