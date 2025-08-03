"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWallet = getWallet;
exports.getWalletPublicKey = getWalletPublicKey;
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = __importDefault(require("bs58"));
const logger_1 = require("../utils/logger");
const config_1 = require("../utils/config");
/**
 * Генерирует и возвращает keypair кошелька из private key в .env.
 * @returns {Keypair} Keypair для подписи транзакций.
 */
function getWallet() {
    // Комментарий: Декодируем base58 private key для безопасности (DRY).
    if (!config_1.WALLET_PRIVATE_KEY) {
        throw new Error('WALLET_PRIVATE_KEY not set in .env');
    }
    const secretKey = bs58_1.default.decode(config_1.WALLET_PRIVATE_KEY);
    const keypair = web3_js_1.Keypair.fromSecretKey(secretKey);
    logger_1.logger.info(`Wallet loaded: ${keypair.publicKey.toBase58()}`);
    return keypair;
}
/**
 * Возвращает публичный ключ кошелька.
 * @returns {PublicKey} PublicKey кошелька.
 */
function getWalletPublicKey() {
    return getWallet().publicKey;
}
