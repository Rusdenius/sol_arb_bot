"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initMarginfiClient = initMarginfiClient;
exports.executeFlashLoan = executeFlashLoan;
const web3_js_1 = require("@solana/web3.js"); // Добавлен VersionedTransaction для tx
const connection_1 = require("./connection");
const wallet_1 = require("./wallet");
const marginfi_client_v2_1 = require("@mrgnlabs/marginfi-client-v2");
const mrgn_common_1 = require("@mrgnlabs/mrgn-common");
const logger_1 = require("../utils/logger");
const helpers_1 = require("../utils/helpers");
const config_1 = require("../utils/config"); // Добавлен для network
// Пример адреса банка Marginfi (динамически - для production; для dev используйте тестовые)
const DEFAULT_USDC_BANK_ADDRESS = new web3_js_1.PublicKey('2s37BPTBW6GfMoC7RkjW7FmWiw4S7QFegD26cFHuWiyR'); // Замени на реальный (production)
/**
 * Инициализирует клиента Marginfi для flash loans.
 * @returns {Promise<MarginfiClient>} Клиент Marginfi.
 */
async function initMarginfiClient() {
    const configEnv = (0, config_1.loadConfig)();
    const environment = configEnv.network === 'devnet' ? 'dev' : 'production'; // Динамическое переключение
    const connection = (0, connection_1.getConnection)();
    const wallet = new mrgn_common_1.NodeWallet((0, wallet_1.getWallet)()); // Адаптация под Marginfi
    const config = (0, marginfi_client_v2_1.getConfig)(environment); // Динамический config
    const client = await (0, helpers_1.retry)(() => marginfi_client_v2_1.MarginfiClient.fetch(config, wallet, connection));
    logger_1.logger.info(`Marginfi client initialized for ${environment}`);
    return client;
}
/**
 * Выполняет flash loan: borrow, выполнение действий (свопы), repay.
 * @param {bigint} amount - Сумма для займа (в lamports).
 * @param {TransactionInstruction[]} instructions - Массив инструкций для свопов (из Jupiter).
 * @param {PublicKey} [bankAddress] - Адрес банка (опционально, default USDC bank).
 * @returns {Promise<string>} Signature транзакции.
 */
async function executeFlashLoan(amount, instructions, bankAddress = DEFAULT_USDC_BANK_ADDRESS) {
    const client = await initMarginfiClient();
    // Комментарий: Получаем банк из клиента (Map.get с base58 строкой).
    const bank = client.banks.get(bankAddress.toBase58());
    if (!bank) {
        logger_1.logger.error(`Bank not found for address: ${bankAddress.toBase58()}`);
        throw new Error(`Bank not found for address: ${bankAddress.toBase58()}`);
    }
    // Создаём flash loan tx (основной метод из latest SDK)
    let flashLoanTx;
    try {
        flashLoanTx = await client.makeFlashLoanTx(amount, instructions, bankAddress); // as any для обхода если нужно
    }
    catch (error) {
        logger_1.logger.error(`Failed to create flash loan tx: ${error}`);
        throw error;
    }
    // Отправляем транзакцию (явное приведение к string)
    try {
        const signature = await (0, helpers_1.retry)(async () => {
            const result = await client.processTransaction(flashLoanTx);
            return result; // Приведение unknown к string
        });
        logger_1.logger.info(`Flash loan executed: ${signature}`);
        return signature;
    }
    catch (error) {
        logger_1.logger.error(`Flash loan failed: ${error}`);
        throw error;
    }
}
