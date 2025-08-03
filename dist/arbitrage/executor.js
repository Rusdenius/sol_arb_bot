"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeArbitrage = executeArbitrage;
const web3_js_1 = require("@solana/web3.js"); // Добавлен TransactionMessage для compile
const api_1 = require("@jup-ag/api"); // Исправленный импорт
const logger_1 = require("../utils/logger");
const config_1 = require("../utils/config");
const connection_1 = require("../solana/connection");
const flashLoan_1 = require("../solana/flashLoan");
const simulation_1 = require("./simulation");
const securityChecker_1 = require("./securityChecker");
/**
 * Выполняет арбитраж для данного треугольника.
 * @param {string[]} triangle - Треугольник токенов.
 * @returns {Promise<string | null>} Signature tx или null если failed.
 */
async function executeArbitrage(triangle) {
    const config = (0, config_1.loadConfig)();
    const connection = (0, connection_1.getConnection)();
    const jupiter = (0, api_1.createJupiterApiClient)(); // Исправленное создание клиента
    // Комментарий: Проверка безопасности перед выполнением.
    for (const token of triangle) {
        if (!(await (0, securityChecker_1.checkContractSafety)(token))) {
            logger_1.logger.warn(`Unsafe token: ${token}`);
            return null;
        }
    }
    // Генерируем инструкции свопов через Jupiter (placeholder: используйте jupiter.swap для реальных)
    const instructions = []; // Placeholder: const { swapTransaction } = await jupiter.swap(...); instructions = swapTransaction.transaction.message.instructions;
    // Симуляция (исправление TS2554: добавлен аргумент для VersionedTransaction)
    const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const message = new web3_js_1.TransactionMessage({
        payerKey: new web3_js_1.PublicKey('YourWalletPublicKeyHere'), // Замените на реальный из wallet.ts
        recentBlockhash,
        instructions
    }).compileToV0Message();
    const simTx = new web3_js_1.VersionedTransaction(message); // Теперь с аргументом
    const simResult = await (0, simulation_1.simulateTransaction)(simTx);
    if (!simResult.success || simResult.profit < config.minProfit)
        return null;
    // Выполнение с flash loan (атомарно)
    const amount = BigInt(config.dealSize * 1e9); // Пример в lamports
    const signature = await (0, flashLoan_1.executeFlashLoan)(amount, instructions);
    return signature;
}
