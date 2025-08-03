import { PublicKey } from '@solana/web3.js';
import { createJupiterApiClient } from '@jup-ag/api';  // Исправленный импорт (нет 'Jupiter')
import axios from 'axios';  // Добавлено для fetch token list
import { logger } from '../utils/logger';
import { retry } from '../utils/helpers';
import { loadConfig, updateConfig } from '../utils/config';
import { getConnection } from '../solana/connection';

// Интерфейс для типизации ответа Jupiter (исправленные имена полей по docs: inAmount, outAmount)
interface QuoteResponse {
    inAmount: string;
    outAmount: string;
    otherAmountThreshold: string;  // Добавлено для полноты (минимальный output с slippage)
    priceImpactPct: string;  // Добавлено (влияние на цену)
    // ... другие поля по нужде (расширь, e.g. routePlan: array)
}

// Интерфейс для токенов из Jupiter /tokens (для генерации; добавлены поля для фильтра)
interface TokenInfo {
    address: string;
    symbol: string;
    liquidity: number;
    market_cap: number;  // Капитализация
    volume_24h: number;  // 24h volume (пример; проверьте API)
    // ... другие
}

// Интерфейс для пулов из Raydium API (для fetchPoolAddresses)
interface PoolInfo {
    id: string;  // Адрес пула
    baseMint: string;
    quoteMint: string;
    liquidity: number;
    // ... другие
}

// Динамический маппинг mints по network (без ручной замены; валидные строки для избежания Non-base58)
const TOKEN_MINTS: Record<'mainnet' | 'devnet', Record<string, PublicKey>> = {
    mainnet: {
        USDC: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
        SOL: new PublicKey('So11111111111111111111111111111111111111112'),
        RAY: new PublicKey('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'),
        JTO: new PublicKey('jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL'),
    },
    devnet: {
        USDC: new PublicKey('Gh9ZsPCpRQVqozJ1gtb2Q3bfuz5czdQin4ySqhg2Ksdk'),  // Валидный devnet USDC (тестовый mint)
        SOL: new PublicKey('So11111111111111111111111111111111111111112'),  // Wrapped SOL (одинаковый на devnet)
        RAY: new PublicKey('CEmSTcCqbCDvkt7347evJ1iAC7TjfaB9ZgXPEPRu5E3z'),  // Пример devnet RAY (если нет - создайте с spl-token)
        JTO: new PublicKey('jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL'),  // Пример; замените на валидный devnet mint (создайте если нужно)
    },
};

/**
 * Конвертирует символ токена в mint адрес (динамически по network).
 * @param {string} symbol - Символ токена (e.g. 'USDC').
 * @returns {PublicKey} Mint адрес.
 */
export function getMintBySymbol(symbol: string): PublicKey {
    const config = loadConfig();
    const networkMints = TOKEN_MINTS[config.network];
    const mintStr = networkMints[symbol];
    if (!mintStr) {
        logger.error(`Unknown token symbol: ${symbol} for ${config.network} - skipping`);
        throw new Error(`Unknown token symbol: ${symbol} for ${config.network}`);
    }
    try {
        return new PublicKey(mintStr);  // Валидация при создании
    } catch (error) {
        logger.error(`Invalid mint for ${symbol} in ${config.network}: ${error}`);
        throw error;
    }
}

/**
 * Генерирует динамические треугольники автоматически (с выбором монет по параметрам).
 * @returns {Promise<string[][]>} Список треугольников.
 */
export async function generateDynamicTriangles(): Promise<string[][]> {
    logger.info('Fetching token list for dynamic generation...');  // Добавлено для видимости
    const config = loadConfig();
    const baseTokens = config.baseTokens;
    const params = config.tokenSelectParams;

    // Комментарий: Fetch списка токенов от Jupiter (бесплатно, минимизирует ручное)
    let tokens: TokenInfo[];
    try {
        const response = await retry(() => axios.get('https://tokens.jup.ag/tokens'));
        tokens = response.data
            .filter((token: TokenInfo) =>
                token.liquidity > config.minLiquidity &&
                token.market_cap > params.minMarketCap &&
                token.volume_24h > params.minVolume &&
                !baseTokens.includes(token.symbol)  // Исключаем базу
            )
            .sort((a: TokenInfo, b: TokenInfo) => b.volume_24h - a.volume_24h)  // Типизация a/b для TS7006
            .slice(0, params.maxTokens);  // Top N по параметру
    } catch (error) {
        logger.error(`Failed to fetch tokens: ${error}`);
        return [];  // Fallback: пустой список
    }

    // Генерация треугольников: base1 -> token -> base2 -> base1
    const triangles: string[][] = [];
    for (const token of tokens) {
        for (let i = 0; i < baseTokens.length; i++) {
            for (let j = 0; j < baseTokens.length; j++) {
                if (i !== j) {
                    triangles.push([baseTokens[i], token.symbol, baseTokens[j]]);
                }
            }
        }
    }
    logger.info(`Selected ${tokens.length} tokens by params and generated ${triangles.length} dynamic triangles`);

    // Сохраняем generated triangles в config для статуса (исправление показа дефолтных)
    config.triangles = triangles;
    updateConfig('triangles', triangles);

    return triangles;
}

/**
 * Fetch адресов пулов автоматически из Raydium API (для мониторинга в Helius).
 * @param {string[][]} triangles - Сгенерированные треугольники.
 * @returns {Promise<string[]>} Массив адресов пулов.
 */
export async function fetchPoolAddresses(triangles: string[][]): Promise<string[]> {
    const config = loadConfig();
    const network = config.network;
    const poolApiUrl = `https://api.raydium.io/v4/sdk/liquidity/${network}.json`;  // Динамический URL

    logger.info(`Fetching pool addresses from ${poolApiUrl}...`);  // Лог для видимости
    let pools: PoolInfo[];
    try {
        const response = await retry(() => axios.get(poolApiUrl));
        pools = response.data;  // Массив пулов
    } catch (error) {
        logger.error(`Failed to fetch pools: ${error}`);
        return [];  // Fallback
    }

    const poolAddresses: string[] = [];
    for (const triangle of triangles) {
        const mints = triangle.map(getMintBySymbol);  // [mintA, mintB, mintC]
        // Пары: A-B, B-C, C-A
        const pairs = [[mints[0], mints[1]], [mints[1], mints[2]], [mints[2], mints[0]]];
        for (const [mintX, mintY] of pairs) {
            // Найти пул с baseMint/quoteMint = mintX/mintY или наоборот, с max liquidity
            const matchingPools = pools.filter((pool: PoolInfo) =>
                (pool.baseMint === mintX.toBase58() && pool.quoteMint === mintY.toBase58()) ||
                (pool.baseMint === mintY.toBase58() && pool.quoteMint === mintX.toBase58())
            ).sort((a: PoolInfo, b: PoolInfo) => b.liquidity - a.liquidity);  // Типизация a/b для TS7006
            if (matchingPools.length > 0 && matchingPools[0].liquidity > config.minLiquidity) {
                poolAddresses.push(matchingPools[0].id);  // Добавить адрес лучшего пула
            }
        }
    }
    logger.info(`Fetched ${poolAddresses.length} pool addresses for ${network}`);
    return poolAddresses;
}

/**
 * Сканирует треугольники на арбитражные возможности (использует динамические если пусто).
 * @returns {Promise<{triangle: string[], profit: number} | null>} Объект с прибыльной возможностью или null.
 */
export async function scanForArbitrage(): Promise<{triangle: string[], profit: number} | null> {
    let config = loadConfig();
    if (config.triangles.length === 0) {
        // Авто-генерация если нет ручных
        config.triangles = await generateDynamicTriangles();
        updateConfig('triangles', config.triangles);  // Сохраняем для повторного использования
    }

    if (config.triangles.length === 0) {
        logger.info('No triangles available - skipping scan');  // Добавлено для видимости
        return null;
    }

    const connection = getConnection();
    const jupiter = createJupiterApiClient();  // Создание клиента

    for (const triangle of config.triangles) {
        // Комментарий: Конвертируем символы в mints для Jupiter.
        const [a, b, c] = triangle.map(getMintBySymbol);
        try {
            // Получаем котировки для пути A->B->C->A через Jupiter (quoteGet)
            const quoteAB: QuoteResponse = await retry(() => jupiter.quoteGet({  // quoteGet для TS2339
                inputMint: a.toBase58(),
                outputMint: b.toBase58(),
                amount: config.dealSize * 1e6,  // Number для API (docs: number)
                slippageBps: 50  // Обязательный параметр по docs
            }));
            const quoteBC: QuoteResponse = await retry(() => jupiter.quoteGet({
                inputMint: b.toBase58(),
                outputMint: c.toBase58(),
                amount: Number(quoteAB.outAmount),  // Конверт string -> number
                slippageBps: 50
            }));
            const quoteCA: QuoteResponse = await retry(() => jupiter.quoteGet({
                inputMint: c.toBase58(),
                outputMint: a.toBase58(),
                amount: Number(quoteBC.outAmount),
                slippageBps: 50
            }));

            // Расчёт прибыли (конверт strings в BigInt для точности)
            const initialAmount = BigInt(config.dealSize * 1e6);
            const finalAmount = BigInt(quoteCA.outAmount);
            const grossProfit = Number(finalAmount - initialAmount) / 1e6;
            const fees = 0.005 * config.dealSize + 0.000005 * 3;  // Пример: 0.5% swap + network fees
            const netProfit = grossProfit - fees;

            if (netProfit > config.minProfit * config.dealSize / 100) {
                logger.info(`Arbitrage opportunity found: ${triangle.join('->')} with profit ${netProfit}`);
                return { triangle, profit: netProfit };
            }
        } catch (error) {
            logger.warn(`Scan error for ${triangle}: ${error}`);
        }
    }
    logger.info('No arbitrage opportunities found in this scan');  // Добавлено для видимости
    return null;
}