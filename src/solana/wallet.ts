import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { logger } from '../utils/logger';
import { WALLET_PRIVATE_KEY } from '../utils/config';

/**
 * Генерирует и возвращает keypair кошелька из private key в .env.
 * @returns {Keypair} Keypair для подписи транзакций.
 */
export function getWallet(): Keypair {
    // Комментарий: Декодируем base58 private key для безопасности (DRY).
    if (!WALLET_PRIVATE_KEY) {
        throw new Error('WALLET_PRIVATE_KEY not set in .env');
    }
    const secretKey = bs58.decode(WALLET_PRIVATE_KEY);
    const keypair = Keypair.fromSecretKey(secretKey);
    logger.info(`Wallet loaded: ${keypair.publicKey.toBase58()}`);
    return keypair;
}

/**
 * Возвращает публичный ключ кошелька.
 * @returns {PublicKey} PublicKey кошелька.
 */
export function getWalletPublicKey(): PublicKey {
    return getWallet().publicKey;
}