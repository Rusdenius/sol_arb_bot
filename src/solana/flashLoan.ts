import { Connection, PublicKey, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';  // Добавлен VersionedTransaction для tx
import { getConnection } from './connection';
import { getWallet } from './wallet';
import { MarginfiClient, getConfig, Bank } from '@mrgnlabs/marginfi-client-v2';
import { NodeWallet } from '@mrgnlabs/mrgn-common';
import { logger } from '../utils/logger';
import { retry } from '../utils/helpers';
import { loadConfig } from '../utils/config';  // Добавлен для network

// Пример адреса банка Marginfi (динамически - для production; для dev используйте тестовые)
const DEFAULT_USDC_BANK_ADDRESS = new PublicKey('2s37BPTBW6GfMoC7RkjW7FmWiw4S7QFegD26cFHuWiyR');  // Замени на реальный (production)

/**
 * Инициализирует клиента Marginfi для flash loans.
 * @returns {Promise<MarginfiClient>} Клиент Marginfi.
 */
export async function initMarginfiClient(): Promise<MarginfiClient> {
    const configEnv = loadConfig();
    const environment = configEnv.network === 'devnet' ? 'dev' : 'production';  // Динамическое переключение

    const connection = getConnection();
    const wallet = new NodeWallet(getWallet());  // Адаптация под Marginfi
    const config = getConfig(environment);  // Динамический config
    const client = await retry(() => MarginfiClient.fetch(config, wallet, connection));
    logger.info(`Marginfi client initialized for ${environment}`);
    return client;
}

/**
 * Выполняет flash loan: borrow, выполнение действий (свопы), repay.
 * @param {bigint} amount - Сумма для займа (в lamports).
 * @param {TransactionInstruction[]} instructions - Массив инструкций для свопов (из Jupiter).
 * @param {PublicKey} [bankAddress] - Адрес банка (опционально, default USDC bank).
 * @returns {Promise<string>} Signature транзакции.
 */
export async function executeFlashLoan(
    amount: bigint,
    instructions: TransactionInstruction[],
    bankAddress: PublicKey = DEFAULT_USDC_BANK_ADDRESS
): Promise<string> {
    const client = await initMarginfiClient();

    // Комментарий: Получаем банк из клиента (Map.get с base58 строкой).
    const bank: Bank | undefined = client.banks.get(bankAddress.toBase58());
    if (!bank) {
        logger.error(`Bank not found for address: ${bankAddress.toBase58()}`);
        throw new Error(`Bank not found for address: ${bankAddress.toBase58()}`);
    }

    // Создаём flash loan tx (основной метод из latest SDK)
    let flashLoanTx: VersionedTransaction;
    try {
        flashLoanTx = await (client as any).makeFlashLoanTx(amount, instructions, bankAddress);  // as any для обхода если нужно
    } catch (error) {
        logger.error(`Failed to create flash loan tx: ${error}`);
        throw error;
    }

    // Отправляем транзакцию (явное приведение к string)
    try {
        const signature = await retry<string>(async () => {
            const result = await (client as any).processTransaction(flashLoanTx);
            return result as string;  // Приведение unknown к string
        });
        logger.info(`Flash loan executed: ${signature}`);
        return signature;
    } catch (error) {
        logger.error(`Flash loan failed: ${error}`);
        throw error;
    }
}