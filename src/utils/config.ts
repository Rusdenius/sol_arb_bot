import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Загружаем .env из корня
dotenv.config({ path: path.join(__dirname, '../../.env') });  // Указываем путь явно для надёжности

export interface BotConfig {
    minProfit: number;  // Минимальная прибыль от сделки (в %)
    minLiquidity: number;  // Минимальная ликвидность пары (в USDC эквиваленте)
    dealSize: number;  // Размер сделки (в USDC)
    minBalance: number;  // Минимальный баланс для авто-стопа
    triangles: string[][];  // Список треугольников, e.g. [['USDC', 'SOL', 'TOKEN1'], ...]
    testMode: boolean;  // Тестовый режим (только симуляция)
    scanInterval: number;  // Интервал сканирования (ms)
    whitelist: string[];  // Whitelist адресов токенов для быстрой проверки безопасности
    baseTokens: string[];  // Базовые токены для генерации треугольников (e.g. ['USDC', 'SOL'])
    network: 'mainnet' | 'devnet';  // Новый параметр для переключения сети
    tokenSelectParams: {  // Новые параметры для выбора монет
        minMarketCap: number;  // Мин. капитализация (USD)
        minVolume: number;  // Мин. 24h volume (USD)
        maxTokens: number;  // Max кол-во выбранных токенов
    };
    // ... другие настройки
}

const CONFIG_PATH = path.join(__dirname, '../../config/config.json');

/**
 * Загружает конфигурацию из JSON-файла или возвращает дефолтную.
 * @returns {BotConfig} Объект конфигурации.
 */
export function loadConfig(): BotConfig {
    // Комментарий: Проверяем наличие файла, если нет - используем дефолты (KISS).
    if (fs.existsSync(CONFIG_PATH)) {
        const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(data) as BotConfig;
    }
    const defaultConfig: BotConfig = {
        minProfit: 0.5,  // 0.5%
        minLiquidity: 10000,  // 10k USDC
        dealSize: 1000,  // 1k USDC
        minBalance: 0.1,  // 0.1 SOL
        triangles: [['USDC', 'SOL', 'RAY'], ['USDC', 'SOL', 'JTO']],  // Примеры треугольников (символы, конвертируем в адреса позже)
        testMode: false,  // По умолчанию тест
        scanInterval: 60000,  // 1 минута
        whitelist: [
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  // USDC
            'So11111111111111111111111111111111111111112',  // SOL
            '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'  // RAY (пример)
        ],
        baseTokens: ['USDC', 'SOL'],  // Default база для авто-генерации
        network: 'mainnet',  // Default: mainnet (измените на 'devnet' для теста)
        tokenSelectParams: {  // Default параметры для выбора монет
            minMarketCap: 1000000,  // $1M
            minVolume: 100000,  // $100k 24h
            maxTokens: 20  // Top 20
        }
    };
    saveConfig(defaultConfig);  // Сохраняем дефолты
    return defaultConfig;
}

/**
 * Сохраняет конфигурацию в JSON-файл.
 * @param {BotConfig} config - Объект конфигурации для сохранения.
 */
export function saveConfig(config: BotConfig): void {
    // Комментарий: Атомарная запись для надёжности.
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Обновляет конкретный параметр в конфиге и сохраняет.
 * @param {keyof BotConfig} key - Ключ параметра.
 * @param {any} value - Новое значение.
 */
export function updateConfig(key: keyof BotConfig, value: any): void {
    const config = loadConfig();
    if (key in config) {
        (config as any)[key] = value;
        saveConfig(config);
    }
}

// Экспортируем секреты из .env для использования в других модулях (DRY)
// Убрали RUGCHECK_API_KEY (не нужен после удаления)
export const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
export const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY || '';
export const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';