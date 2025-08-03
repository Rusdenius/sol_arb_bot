"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatId = void 0;
exports.registerCommands = registerCommands;
const bot_1 = require("./bot"); // Импорт Markup и функций для menuMessageId (исправление TS2632)
const config_1 = require("../utils/config");
const logger_1 = require("../utils/logger");
const arbitrageScanner_1 = require("../arbitrage/arbitrageScanner"); // scan and generate
const connection_1 = require("../solana/connection"); // Добавлено для баланса
const wallet_1 = require("../solana/wallet"); // Добавлено для баланса
const web3_js_1 = require("@solana/web3.js"); // Добавлено для типа Connection (исправление TS2552)
// Глобальный флаг для статуса бота (упрощённо; используйте в index.ts для реального цикла)
let isRunning = false;
// Глобальный chatId (экспортируем для index.ts)
exports.chatId = null; // Добавлено для уведомлений
// Simple state for last command (для ожидания input после кнопки)
let lastCommand = null;
// Type guard для проверки text сообщения (исправление TS2339)
function isTextMessage(ctx) {
    return ctx.message !== undefined && 'text' in ctx.message;
}
/**
 * Показывает основное меню с кнопками (delete old + send new for "update").
 * @param {Context<Update>} ctx - Контекст Telegram.
 * @param {string} [text] - Текст сообщения (default: 'Главное меню').
 */
async function showMainMenu(ctx, text = 'Главное меню:') {
    const keyboard = bot_1.Markup.inlineKeyboard([
        [bot_1.Markup.button.callback('Start', 'start'), bot_1.Markup.button.callback('Stop', 'stop')],
        [bot_1.Markup.button.callback('Status', 'status'), bot_1.Markup.button.callback('Set Params', 'set_params')],
        [bot_1.Markup.button.callback('Add Triangle', 'add_triangle'), bot_1.Markup.button.callback('Add Whitelist', 'add_whitelist')],
        [bot_1.Markup.button.callback('Test Arbitrage', 'test_arbitrage'), bot_1.Markup.button.callback('Set Network', 'set_network')],
        [bot_1.Markup.button.callback('Regenerate Triangles', 'regenerate')] // Новая кнопка для регенерации
    ]);
    // Delete previous message if exists (to simulate edit)
    const currentMessageId = (0, bot_1.getMenuMessageId)();
    if (currentMessageId && exports.chatId) {
        try {
            await ctx.telegram.deleteMessage(exports.chatId, currentMessageId);
        }
        catch (error) {
            logger_1.logger.warn(`Failed to delete message: ${error}`);
        }
    }
    // Send new message
    const sentMessage = await ctx.reply(text, keyboard);
    (0, bot_1.setMenuMessageId)(sentMessage.message_id);
}
/**
 * Показывает подменю для настроек.
 * @param {Context<Update>} ctx - Контекст Telegram.
 */
async function showSetParamsMenu(ctx) {
    const keyboard = bot_1.Markup.inlineKeyboard([
        [bot_1.Markup.button.callback('Min Profit', 'set_min_profit'), bot_1.Markup.button.callback('Min Liquidity', 'set_min_liquidity')],
        [bot_1.Markup.button.callback('Deal Size', 'set_deal_size'), bot_1.Markup.button.callback('Min Balance', 'set_min_balance')],
        [bot_1.Markup.button.callback('Token Select Params', 'token_select_params')], // Новая кнопка для подподменю
        [bot_1.Markup.button.callback('Back', 'back')]
    ]);
    // Delete previous
    const currentMessageId = (0, bot_1.getMenuMessageId)();
    if (currentMessageId && exports.chatId) {
        try {
            await ctx.telegram.deleteMessage(exports.chatId, currentMessageId);
        }
        catch (error) {
            logger_1.logger.warn(`Failed to delete message: ${error}`);
        }
    }
    // Send new
    const sentMessage = await ctx.reply('Настройки параметров:', keyboard);
    (0, bot_1.setMenuMessageId)(sentMessage.message_id);
}
/**
 * Показывает подподменю для tokenSelectParams.
 * @param {Context<Update>} ctx - Контекст Telegram.
 */
async function showTokenSelectParamsMenu(ctx) {
    const keyboard = bot_1.Markup.inlineKeyboard([
        [bot_1.Markup.button.callback('Min Market Cap', 'set_min_market_cap'), bot_1.Markup.button.callback('Min Volume', 'set_min_volume')],
        [bot_1.Markup.button.callback('Max Tokens', 'set_max_tokens')],
        [bot_1.Markup.button.callback('Back', 'back')]
    ]);
    // Delete previous
    const currentMessageId = (0, bot_1.getMenuMessageId)();
    if (currentMessageId && exports.chatId) {
        try {
            await ctx.telegram.deleteMessage(exports.chatId, currentMessageId);
        }
        catch (error) {
            logger_1.logger.warn(`Failed to delete message: ${error}`);
        }
    }
    // Send new
    const sentMessage = await ctx.reply('Настройки tokenSelectParams:', keyboard);
    (0, bot_1.setMenuMessageId)(sentMessage.message_id);
}
/**
 * Показывает статус (delete + new), с балансом кошелька (fallback if Helius fails).
 * @param {Context<Update>} ctx - Контекст Telegram.
 */
async function showStatus(ctx) {
    const config = (0, config_1.loadConfig)();
    const status = isRunning ? 'Запущен' : 'Остановлен';
    // Получение баланса with fallback (fix 525 error)
    let balanceText = 'Balance: Error';
    try {
        const connection = (0, connection_1.getConnection)();
        const wallet = (0, wallet_1.getWalletPublicKey)();
        let balance = await connection.getBalance(wallet);
        if (balance === 0) { // If Helius fails, fallback to public RPC
            const fallbackConnection = new web3_js_1.Connection('https://api.mainnet-beta.solana.com', 'confirmed');
            balance = await fallbackConnection.getBalance(wallet);
        }
        balanceText = `Balance: ${balance / 1e9} SOL`; // Конверт lamports to SOL
    }
    catch (error) {
        logger_1.logger.error(`Failed to get balance: ${error}`);
    }
    const statusText = `Статус: ${status}\n${balanceText}\nMin Profit: ${config.minProfit}%\nMin Liquidity: ${config.minLiquidity}\nDeal Size: ${config.dealSize}\nMin Balance: ${config.minBalance}\nTriangles: ${JSON.stringify(config.triangles)}\nWhitelist: ${JSON.stringify(config.whitelist)}\nNetwork: ${config.network}`;
    // Delete previous
    const currentMessageId = (0, bot_1.getMenuMessageId)();
    if (currentMessageId && exports.chatId) {
        try {
            await ctx.telegram.deleteMessage(exports.chatId, currentMessageId);
        }
        catch (error) {
            logger_1.logger.warn(`Failed to delete message: ${error}`);
        }
    }
    // Send new with back button
    const sentMessage = await ctx.reply(statusText, bot_1.Markup.inlineKeyboard([[bot_1.Markup.button.callback('Back', 'back')]]));
    (0, bot_1.setMenuMessageId)(sentMessage.message_id);
}
/**
 * Регистрирует все команды для бота.
 * @param {Telegraf} bot - Инстанс бота.
 */
function registerCommands(bot) {
    // /menu: Показать графическое меню
    bot.command('menu', (ctx) => {
        showMainMenu(ctx);
    });
    // /start: Запуск бота и меню
    bot.command('start', (ctx) => {
        isRunning = true;
        exports.chatId = ctx.chat?.id?.toString() ?? null; // Set chatId
        logger_1.logger.info('Bot started via Telegram');
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
                    showStatus(ctx); // Update status
                    break;
                case 'stop':
                    isRunning = false;
                    showStatus(ctx); // Update status
                    break;
                case 'status':
                    showStatus(ctx);
                    break;
                case 'set_params':
                    showSetParamsMenu(ctx);
                    break;
                case 'token_select_params':
                    showTokenSelectParamsMenu(ctx); // Новое подподменю
                    break;
                case 'add_triangle':
                    lastCommand = 'add_triangle';
                    await ctx.reply('Введите треугольник в формате A B C (e.g. USDC SOL RAY):', bot_1.Markup.inlineKeyboard([[bot_1.Markup.button.callback('Back', 'back')]]));
                    break;
                case 'add_whitelist':
                    lastCommand = 'add_whitelist';
                    await ctx.reply('Введите mint адрес для whitelist:', bot_1.Markup.inlineKeyboard([[bot_1.Markup.button.callback('Back', 'back')]]));
                    break;
                case 'test_arbitrage':
                    // Async test to avoid blocking (fix timeout)
                    setImmediate(async () => {
                        const opportunity = await (0, arbitrageScanner_1.scanForArbitrage)();
                        if (opportunity) {
                            await ctx.reply(`Найдена возможность: ${opportunity.triangle.join('->')} с прибылью ${opportunity.profit}`);
                            // ... (execute if not testMode)
                        }
                        else {
                            await ctx.reply('Нет возможностей на данный момент.');
                        }
                        showMainMenu(ctx);
                    });
                    break;
                case 'set_network':
                    lastCommand = 'set_network';
                    await ctx.reply('Введите сеть (mainnet или devnet):', bot_1.Markup.inlineKeyboard([[bot_1.Markup.button.callback('Back', 'back')]]));
                    break;
                case 'set_min_profit':
                    lastCommand = 'set_min_profit';
                    await ctx.reply('Введите значение для Min Profit (e.g. 0.5):', bot_1.Markup.inlineKeyboard([[bot_1.Markup.button.callback('Back', 'back')]]));
                    break;
                case 'set_min_liquidity':
                    lastCommand = 'set_min_liquidity';
                    await ctx.reply('Введите значение для Min Liquidity (e.g. 10000):', bot_1.Markup.inlineKeyboard([[bot_1.Markup.button.callback('Back', 'back')]]));
                    break;
                case 'set_deal_size':
                    lastCommand = 'set_deal_size';
                    await ctx.reply('Введите значение для Deal Size (e.g. 1000):', bot_1.Markup.inlineKeyboard([[bot_1.Markup.button.callback('Back', 'back')]]));
                    break;
                case 'set_min_balance':
                    lastCommand = 'set_min_balance';
                    await ctx.reply('Введите значение для Min Balance (e.g. 0.1):', bot_1.Markup.inlineKeyboard([[bot_1.Markup.button.callback('Back', 'back')]]));
                    break;
                case 'set_min_market_cap':
                    lastCommand = 'set_min_market_cap';
                    await ctx.reply('Введите значение для Min Market Cap (e.g. 1000000):', bot_1.Markup.inlineKeyboard([[bot_1.Markup.button.callback('Back', 'back')]]));
                    break;
                case 'set_min_volume':
                    lastCommand = 'set_min_volume';
                    await ctx.reply('Введите значение для Min Volume (e.g. 100000):', bot_1.Markup.inlineKeyboard([[bot_1.Markup.button.callback('Back', 'back')]]));
                    break;
                case 'set_max_tokens':
                    lastCommand = 'set_max_tokens';
                    await ctx.reply('Введите значение для Max Tokens (e.g. 20):', bot_1.Markup.inlineKeyboard([[bot_1.Markup.button.callback('Back', 'back')]]));
                    break;
                case 'regenerate':
                    // Force regenerate triangles
                    await (0, arbitrageScanner_1.generateDynamicTriangles)();
                    await ctx.answerCbQuery('Triangles regenerated');
                    showStatus(ctx); // Show updated status with new triangles
                    break;
                case 'back':
                    showMainMenu(ctx);
                    break;
                default:
                    await ctx.reply('Неизвестная команда');
            }
        }
        else {
            logger_1.logger.warn('CallbackQuery without data');
        }
    });
    // Обработка text сообщений (для input после кнопок)
    bot.on('text', (ctx) => {
        if (lastCommand && isTextMessage(ctx)) { // Guard для TS18048 и TS2339
            const input = ctx.message.text.trim();
            switch (lastCommand) {
                case 'set_min_profit':
                    const minProfit = parseFloat(input);
                    if (isNaN(minProfit))
                        return ctx.reply('Неверное значение.');
                    (0, config_1.updateConfig)('minProfit', minProfit);
                    ctx.reply(`Min Profit установлен на ${minProfit}%`);
                    break;
                case 'set_min_liquidity':
                    const minLiquidity = parseFloat(input);
                    if (isNaN(minLiquidity))
                        return ctx.reply('Неверное значение.');
                    (0, config_1.updateConfig)('minLiquidity', minLiquidity);
                    ctx.reply(`Min Liquidity установлен на ${minLiquidity}`);
                    break;
                case 'set_deal_size':
                    const dealSize = parseFloat(input);
                    if (isNaN(dealSize))
                        return ctx.reply('Неверное значение.');
                    (0, config_1.updateConfig)('dealSize', dealSize);
                    ctx.reply(`Deal Size установлен на ${dealSize}`);
                    break;
                case 'set_min_balance':
                    const minBalance = parseFloat(input);
                    if (isNaN(minBalance))
                        return ctx.reply('Неверное значение.');
                    (0, config_1.updateConfig)('minBalance', minBalance);
                    ctx.reply(`Min Balance установлен на ${minBalance}`);
                    break;
                case 'add_triangle':
                    const args = input.split(' ');
                    if (args.length !== 3)
                        return ctx.reply('Неверно. Формат: A B C');
                    const config = (0, config_1.loadConfig)();
                    config.triangles.push(args);
                    (0, config_1.updateConfig)('triangles', config.triangles);
                    ctx.reply(`Треугольник добавлен: ${args.join('->')}`);
                    break;
                case 'add_whitelist':
                    const mint = input;
                    const configWhitelist = (0, config_1.loadConfig)();
                    configWhitelist.whitelist.push(mint);
                    (0, config_1.updateConfig)('whitelist', configWhitelist.whitelist);
                    ctx.reply(`Добавлено в whitelist: ${mint}`);
                    break;
                case 'set_network':
                    const network = input;
                    if (network !== 'mainnet' && network !== 'devnet')
                        return ctx.reply('Неверно.');
                    (0, config_1.updateConfig)('network', network);
                    ctx.reply(`Сеть установлена на ${network}. Перезапустите бота.`);
                    break;
                case 'set_min_market_cap':
                    const minMarketCap = parseFloat(input);
                    if (isNaN(minMarketCap))
                        return ctx.reply('Неверное значение.');
                    const configMarket = (0, config_1.loadConfig)();
                    configMarket.tokenSelectParams.minMarketCap = minMarketCap;
                    (0, config_1.updateConfig)('tokenSelectParams', configMarket.tokenSelectParams);
                    ctx.reply(`Min Market Cap установлен на ${minMarketCap}`);
                    break;
                case 'set_min_volume':
                    const minVolume = parseFloat(input);
                    if (isNaN(minVolume))
                        return ctx.reply('Неверное значение.');
                    const configVolume = (0, config_1.loadConfig)();
                    configVolume.tokenSelectParams.minVolume = minVolume;
                    (0, config_1.updateConfig)('tokenSelectParams', configVolume.tokenSelectParams);
                    ctx.reply(`Min Volume установлен на ${minVolume}`);
                    break;
                case 'set_max_tokens':
                    const maxTokens = parseInt(input);
                    if (isNaN(maxTokens))
                        return ctx.reply('Неверное значение.');
                    const configMax = (0, config_1.loadConfig)();
                    configMax.tokenSelectParams.maxTokens = maxTokens;
                    (0, config_1.updateConfig)('tokenSelectParams', configMax.tokenSelectParams);
                    ctx.reply(`Max Tokens установлен на ${maxTokens}`);
                    break;
            }
            lastCommand = null; // Сброс state
            showMainMenu(ctx); // Back to menu
        }
    });
    // ... (остальные команды как раньше, e.g. /status без кнопок)
}
