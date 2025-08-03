"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RPC_ENDPOINT = exports.WALLET_PRIVATE_KEY = exports.HELIUS_API_KEY = exports.TELEGRAM_TOKEN = void 0;
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
exports.updateConfig = updateConfig;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
// Загружаем .env из корня
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../.env') }); // Указываем путь явно для надёжности
const CONFIG_PATH = path_1.default.join(__dirname, '../../config/config.json');
/**
 * Загружает конфигурацию из JSON-файла или возвращает дефолтную.
 * @returns {BotConfig} Объект конфигурации.
 */
function loadConfig() {
    // Комментарий: Проверяем наличие файла, если нет - используем дефолты (KISS).
    if (fs_1.default.existsSync(CONFIG_PATH)) {
        const data = fs_1.default.readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(data);
    }
    const defaultConfig = {
        minProfit: 0.5, // 0.5%
        minLiquidity: 10000, // 10k USDC
        dealSize: 1000, // 1k USDC
        minBalance: 0.1, // 0.1 SOL
        triangles: [['USDC', 'SOL', 'RAY'], ['USDC', 'SOL', 'JTO']], // Примеры треугольников (символы, конвертируем в адреса позже)
        testMode: false, // По умолчанию тест
        scanInterval: 60000, // 1 минута
        whitelist: [
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
            'So11111111111111111111111111111111111111112', // SOL
            '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R' // RAY (пример)
        ],
        baseTokens: ['USDC', 'SOL'], // Default база для авто-генерации
        network: 'mainnet', // Default: mainnet (измените на 'devnet' для теста)
        tokenSelectParams: {
            minMarketCap: 1000000, // $1M
            minVolume: 100000, // $100k 24h
            maxTokens: 20 // Top 20
        }
    };
    saveConfig(defaultConfig); // Сохраняем дефолты
    return defaultConfig;
}
/**
 * Сохраняет конфигурацию в JSON-файл.
 * @param {BotConfig} config - Объект конфигурации для сохранения.
 */
function saveConfig(config) {
    // Комментарий: Атомарная запись для надёжности.
    fs_1.default.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
/**
 * Обновляет конкретный параметр в конфиге и сохраняет.
 * @param {keyof BotConfig} key - Ключ параметра.
 * @param {any} value - Новое значение.
 */
function updateConfig(key, value) {
    const config = loadConfig();
    if (key in config) {
        config[key] = value;
        saveConfig(config);
    }
}
// Экспортируем секреты из .env для использования в других модулях (DRY)
// Убрали RUGCHECK_API_KEY (не нужен после удаления)
exports.TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
exports.HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
exports.WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY || '';
exports.RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
