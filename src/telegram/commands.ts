import { Telegraf, Context, NarrowedContext } from 'telegraf';  // Добавлен NarrowedContext для type guards
import { Update, Message } from 'telegraf/types';  // Импорт типов для guard
import { Markup, setMenuMessageId, getMenuMessageId } from './bot';  // Импорт Markup и функций для menuMessageId (исправление TS2632)
import { loadConfig, updateConfig } from '../utils/config';
import { logger } from '../utils/logger';
import { scanForArbitrage, generateDynamicTriangles } from '../arbitrage/arbitrageScanner';  // scan and generate
import { executeArbitrage } from '../arbitrage/executor';  // Исправленный импорт для TS2305
import { sendNotification } from './bot';  // Для уведомлений
import { getConnection } from '../solana/connection';  // Добавлено для баланса
import { getWalletPublicKey } from '../solana/wallet';  // Добавлено для баланса
import { Connection } from '@solana/web3.js';  // Добавлено для типа Connection (исправление TS2552)

// Глобальный флаг для статуса бота (упрощённо; используйте в index.ts для реального цикла)
let isRunning = false;

// Глобальный chatId (экспортируем для index.ts)
export let chatId: string | null = null;  // Добавлено для уведомлений

// Simple state for last command (для ожидания input после кнопки)
let lastCommand: string | null = null;

// Type guard для проверки text сообщения (исправление TS2339)
function isTextMessage(ctx: Context<Update>): ctx is NarrowedContext<Context<Update>, Update.MessageUpdate<Message.TextMessage>> {
    return ctx.message !== undefined && 'text' in ctx.message;
}

/**
 * Показывает основное меню с кнопками (delete old + send new for "update").
 * @param {Context<Update>} ctx - Контекст Telegram.
 * @param {string} [text] - Текст сообщения (default: 'Главное меню').
 */
async function showMainMenu(ctx: Context<Update>, text: string = 'Главное меню:') {
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('Start', 'start'), Markup.button.callback('Stop', 'stop')],
        [Markup.button.callback('Status', 'status'), Markup.button.callback('Set Params', 'set_params')],
        [Markup.button.callback('Add Triangle', 'add_triangle'), Markup.button.callback('Add Whitelist', 'add_whitelist')],
        [Markup.button.callback('Test Arbitrage', 'test_arbitrage'), Markup.button.callback('Set Network', 'set_network')],
        [Markup.button.callback('Regenerate Triangles', 'regenerate')]  // Новая кнопка для регенерации
    ]);

    // Delete previous message if exists (to simulate edit)
    const currentMessageId = getMenuMessageId();
    if (currentMessageId && chatId) {
        try {
            await ctx.telegram.deleteMessage(chatId, currentMessageId);
        } catch (error) {
            logger.warn(`Failed to delete message: ${error}`);
        }
    }

    // Send new message
    const sentMessage = await ctx.reply(text, keyboard);
    setMenuMessageId(sentMessage.message_id);
}

/**
 * Показывает подменю для настроек.
 * @param {Context<Update>} ctx - Контекст Telegram.
 */
async function showSetParamsMenu(ctx: Context<Update>) {
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('Min Profit', 'set_min_profit'), Markup.button.callback('Min Liquidity', 'set_min_liquidity')],
        [Markup.button.callback('Deal Size', 'set_deal_size'), Markup.button.callback('Min Balance', 'set_min_balance')],
        [Markup.button.callback('Token Select Params', 'token_select_params')],  // Новая кнопка для подподменю
        [Markup.button.callback('Back', 'back')]
    ]);

    // Delete previous
    const currentMessageId = getMenuMessageId();
    if (currentMessageId && chatId) {
        try {
            await ctx.telegram.deleteMessage(chatId, currentMessageId);
        } catch (error) {
            logger.warn(`Failed to delete message: ${error}`);
        }
    }

    // Send new
    const sentMessage = await ctx.reply('Настройки параметров:', keyboard);
    setMenuMessageId(sentMessage.message_id);
}

/**
 * Показывает подподменю для tokenSelectParams.
 * @param {Context<Update>} ctx - Контекст Telegram.
 */
async function showTokenSelectParamsMenu(ctx: Context<Update>) {
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('Min Market Cap', 'set_min_market_cap'), Markup.button.callback('Min Volume', 'set_min_volume')],
        [Markup.button.callback('Max Tokens', 'set_max_tokens')],
        [Markup.button.callback('Back', 'back')]
    ]);

    // Delete previous
    const currentMessageId = getMenuMessageId();
    if (currentMessageId && chatId) {
        try {
            await ctx.telegram.deleteMessage(chatId, currentMessageId);
        } catch (error) {
            logger.warn(`Failed to delete message: ${error}`);
        }
    }

    // Send new
    const sentMessage = await ctx.reply('Настройки tokenSelectParams:', keyboard);
    setMenuMessageId(sentMessage.message_id);
}

/**
 * Показывает статус (delete + new), с балансом кошелька (fallback if Helius fails).
 * @param {Context<Update>} ctx - Контекст Telegram.
 */
async function showStatus(ctx: Context<Update>) {
    const config = loadConfig();
    const status = isRunning ? 'Запущен' : 'Остановлен';

    // Получение баланса with fallback (fix 525 error)
    let balanceText = 'Balance: Error';
    try {
        const connection = getConnection();
        const wallet = getWalletPublicKey();
        let balance = await connection.getBalance(wallet);
        if (balance === 0) {  // If Helius fails, fallback to public RPC
            const fallbackConnection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
            balance = await fallbackConnection.getBalance(wallet);
        }
        balanceText = `Balance: ${balance / 1e9} SOL`;  // Конверт lamports to SOL
    } catch (error) {
        logger.error(`Failed to get balance: ${error}`);
    }

    const statusText = `Статус: ${status}\n${balanceText}\nMin Profit: ${config.minProfit}%\nMin Liquidity: ${config.minLiquidity}\nDeal Size: ${config.dealSize}\nMin Balance: ${config.minBalance}\nTriangles: ${JSON.stringify(config.triangles)}\nWhitelist: ${JSON.stringify(config.whitelist)}\nNetwork: ${config.network}`;

    // Delete previous
    const currentMessageId = getMenuMessageId();
    if (currentMessageId && chatId) {
        try {
            await ctx.telegram.deleteMessage(chatId, currentMessageId);
        } catch (error) {
            logger.warn(`Failed to delete message: ${error}`);
        }
    }

    // Send new with back button
    const sentMessage = await ctx.reply(statusText, Markup.inlineKeyboard([[Markup.button.callback('Back', 'back')]]));
    setMenuMessageId(sentMessage.message_id);
}

/**
 * Регистрирует все команды для бота.
 * @param {Telegraf} bot - Инстанс бота.
 */
export function registerCommands(bot: Telegraf): void {
    // /menu: Показать графическое меню
    bot.command('menu', (ctx: Context<Update>) => {
        showMainMenu(ctx);
    });

    // /start: Запуск бота и меню
    bot.command('start', (ctx: Context<Update>) => {
        isRunning = true;
        chatId = ctx.chat?.id?.toString() ?? null;  // Set chatId
        logger.info('Bot started via Telegram');
        showMainMenu(ctx, 'Бот запущен. Главное меню:');
    });

    // Обработка кнопок (callback_query) - immediate acknowledge to avoid timeout
    bot.on('callback_query', async (ctx) => {
        // Immediate acknowledge (fix timeout)
        await ctx.answerCbQuery();

        // Type guard for data
        if ('data' in ctx.callbackQuery) {
            const data = ctx.callbackQuery.data;

            switch (data) {
                case 'start':
                    isRunning = true;
                    showStatus(ctx);  // Update status
                    break;
                case 'stop':
                    isRunning = false;
                    showStatus(ctx);  // Update status
                    break;
                case 'status':
                    showStatus(ctx);
                    break;
                case 'set_params':
                    showSetParamsMenu(ctx);
                    break;
                case 'token_select_params':
                    showTokenSelectParamsMenu(ctx);  // Новое подподменю
                    break;
                case 'add_triangle':
                    lastCommand = 'add_triangle';
                    await ctx.reply('Введите треугольник в формате A B C (e.g. USDC SOL RAY):', Markup.inlineKeyboard([[Markup.button.callback('Back', 'back')]]));
                    break;
                case 'add_whitelist':
                    lastCommand = 'add_whitelist';
                    await ctx.reply('Введите mint адрес для whitelist:', Markup.inlineKeyboard([[Markup.button.callback('Back', 'back')]]));
                    break;
                case 'test_arbitrage':
                    // Async test to avoid blocking (fix timeout)
                    setImmediate(async () => {
                        const opportunity = await scanForArbitrage();
                        if (opportunity) {
                            await ctx.reply(`Найдена возможность: ${opportunity.triangle.join('->')} с прибылью ${opportunity.profit}`);
                            // ... (execute if not testMode)
                        } else {
                            await ctx.reply('Нет возможностей на данный момент.');
                        }
                        showMainMenu(ctx);
                    });
                    break;
                case 'set_network':
                    lastCommand = 'set_network';
                    await ctx.reply('Введите сеть (mainnet или devnet):', Markup.inlineKeyboard([[Markup.button.callback('Back', 'back')]]));
                    break;
                case 'set_min_profit':
                    lastCommand = 'set_min_profit';
                    await ctx.reply('Введите значение для Min Profit (e.g. 0.5):', Markup.inlineKeyboard([[Markup.button.callback('Back', 'back')]]));
                    break;
                case 'set_min_liquidity':
                    lastCommand = 'set_min_liquidity';
                    await ctx.reply('Введите значение для Min Liquidity (e.g. 10000):', Markup.inlineKeyboard([[Markup.button.callback('Back', 'back')]]));
                    break;
                case 'set_deal_size':
                    lastCommand = 'set_deal_size';
                    await ctx.reply('Введите значение для Deal Size (e.g. 1000):', Markup.inlineKeyboard([[Markup.button.callback('Back', 'back')]]));
                    break;
                case 'set_min_balance':
                    lastCommand = 'set_min_balance';
                    await ctx.reply('Введите значение для Min Balance (e.g. 0.1):', Markup.inlineKeyboard([[Markup.button.callback('Back', 'back')]]));
                    break;
                case 'set_min_market_cap':
                    lastCommand = 'set_min_market_cap';
                    await ctx.reply('Введите значение для Min Market Cap (e.g. 1000000):', Markup.inlineKeyboard([[Markup.button.callback('Back', 'back')]]));
                    break;
                case 'set_min_volume':
                    lastCommand = 'set_min_volume';
                    await ctx.reply('Введите значение для Min Volume (e.g. 100000):', Markup.inlineKeyboard([[Markup.button.callback('Back', 'back')]]));
                    break;
                case 'set_max_tokens':
                    lastCommand = 'set_max_tokens';
                    await ctx.reply('Введите значение для Max Tokens (e.g. 20):', Markup.inlineKeyboard([[Markup.button.callback('Back', 'back')]]));
                    break;
                case 'regenerate':
                    // Force regenerate triangles
                    await generateDynamicTriangles();
                    await ctx.answerCbQuery('Triangles regenerated');
                    showStatus(ctx);  // Show updated status with new triangles
                    break;
                case 'back':
                    showMainMenu(ctx);
                    break;
                default:
                    await ctx.reply('Неизвестная команда');
            }
        } else {
            logger.warn('CallbackQuery without data');
        }
    });

    // Обработка text сообщений (для input после кнопок)
    bot.on('text', (ctx: Context<Update>) => {
        if (lastCommand && isTextMessage(ctx)) {  // Guard для TS18048 и TS2339
            const input = ctx.message.text.trim();
            switch (lastCommand) {
                case 'set_min_profit':
                    const minProfit = parseFloat(input);
                    if (isNaN(minProfit)) return ctx.reply('Неверное значение.');
                    updateConfig('minProfit', minProfit);
                    ctx.reply(`Min Profit установлен на ${minProfit}%`);
                    break;
                case 'set_min_liquidity':
                    const minLiquidity = parseFloat(input);
                    if (isNaN(minLiquidity)) return ctx.reply('Неверное значение.');
                    updateConfig('minLiquidity', minLiquidity);
                    ctx.reply(`Min Liquidity установлен на ${minLiquidity}`);
                    break;
                case 'set_deal_size':
                    const dealSize = parseFloat(input);
                    if (isNaN(dealSize)) return ctx.reply('Неверное значение.');
                    updateConfig('dealSize', dealSize);
                    ctx.reply(`Deal Size установлен на ${dealSize}`);
                    break;
                case 'set_min_balance':
                    const minBalance = parseFloat(input);
                    if (isNaN(minBalance)) return ctx.reply('Неверное значение.');
                    updateConfig('minBalance', minBalance);
                    ctx.reply(`Min Balance установлен на ${minBalance}`);
                    break;
                case 'add_triangle':
                    const args = input.split(' ');
                    if (args.length !== 3) return ctx.reply('Неверно. Формат: A B C');
                    const config = loadConfig();
                    config.triangles.push(args);
                    updateConfig('triangles', config.triangles);
                    ctx.reply(`Треугольник добавлен: ${args.join('->')}`);
                    break;
                case 'add_whitelist':
                    const mint = input;
                    const configWhitelist = loadConfig();
                    configWhitelist.whitelist.push(mint);
                    updateConfig('whitelist', configWhitelist.whitelist);
                    ctx.reply(`Добавлено в whitelist: ${mint}`);
                    break;
                case 'set_network':
                    const network = input as 'mainnet' | 'devnet';
                    if (network !== 'mainnet' && network !== 'devnet') return ctx.reply('Неверно.');
                    updateConfig('network', network);
                    ctx.reply(`Сеть установлена на ${network}. Перезапустите бота.`);
                    break;
                case 'set_min_market_cap':
                    const minMarketCap = parseFloat(input);
                    if (isNaN(minMarketCap)) return ctx.reply('Неверное значение.');
                    const configMarket = loadConfig();
                    configMarket.tokenSelectParams.minMarketCap = minMarketCap;
                    updateConfig('tokenSelectParams', configMarket.tokenSelectParams);
                    ctx.reply(`Min Market Cap установлен на ${minMarketCap}`);
                    break;
                case 'set_min_volume':
                    const minVolume = parseFloat(input);
                    if (isNaN(minVolume)) return ctx.reply('Неверное значение.');
                    const configVolume = loadConfig();
                    configVolume.tokenSelectParams.minVolume = minVolume;
                    updateConfig('tokenSelectParams', configVolume.tokenSelectParams);
                    ctx.reply(`Min Volume установлен на ${minVolume}`);
                    break;
                case 'set_max_tokens':
                    const maxTokens = parseInt(input);
                    if (isNaN(maxTokens)) return ctx.reply('Неверное значение.');
                    const configMax = loadConfig();
                    configMax.tokenSelectParams.maxTokens = maxTokens;
                    updateConfig('tokenSelectParams', configMax.tokenSelectParams);
                    ctx.reply(`Max Tokens установлен на ${maxTokens}`);
                    break;
            }
            lastCommand = null;  // Сброс state
            showMainMenu(ctx);  // Back to menu
        }
    });

    // ... (остальные команды как раньше, e.g. /status без кнопок)
}