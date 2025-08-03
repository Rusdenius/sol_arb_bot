"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Markup = void 0;
exports.setMenuMessageId = setMenuMessageId;
exports.getMenuMessageId = getMenuMessageId;
exports.initTelegramBot = initTelegramBot;
exports.startBot = startBot;
exports.stopBot = stopBot;
exports.sendNotification = sendNotification;
const telegraf_1 = require("telegraf"); // Добавлен Markup для клавиатур
Object.defineProperty(exports, "Markup", { enumerable: true, get: function () { return telegraf_1.Markup; } });
const config_1 = require("../utils/config");
const logger_1 = require("../utils/logger");
const commands_1 = require("./commands"); // Импорт обработчиков
// Глобальный бот (singleton для DRY)
let bot = null;
// Private menuMessageId (не экспортируем напрямую)
let menuMessageId = null;
/**
 * Set menuMessageId.
 * @param {number | null} id - Message ID.
 */
function setMenuMessageId(id) {
    menuMessageId = id;
}
/**
 * Get menuMessageId.
 * @returns {number | null} Message ID.
 */
function getMenuMessageId() {
    return menuMessageId;
}
/**
 * Инициализирует и возвращает Telegram-бота.
 * @returns {Telegraf} Инстанс бота.
 */
function initTelegramBot() {
    if (!config_1.TELEGRAM_TOKEN) {
        throw new Error('TELEGRAM_BOT_TOKEN not set in .env');
    }
    bot = new telegraf_1.Telegraf(config_1.TELEGRAM_TOKEN);
    // Регистрация команд
    (0, commands_1.registerCommands)(bot);
    // Обработка ошибок (стабильность)
    bot.catch((err, ctx) => {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger_1.logger.error(`Telegram error: ${errorMessage}`);
        ctx.reply('Произошла ошибка. Попробуйте позже.');
    });
    logger_1.logger.info('Telegram bot initialized');
    return bot;
}
/**
 * Запускает бота (polling для сообщений).
 */
async function startBot() {
    const telegramBot = initTelegramBot();
    await telegramBot.launch();
    logger_1.logger.info('Telegram bot started');
}
/**
 * Останавливает бота.
 */
async function stopBot() {
    if (bot) {
        await bot.stop();
        logger_1.logger.info('Telegram bot stopped');
    }
}
/**
 * Отправляет уведомление в Telegram (e.g. о сделке или ошибке).
 * @param {string} chatId - ID чата (получайте из ctx.chat.id).
 * @param {string} message - Сообщение для отправки.
 */
async function sendNotification(chatId, message) {
    if (bot) {
        try {
            await bot.telegram.sendMessage(chatId, message);
            logger_1.logger.info(`Notification sent: ${message}`);
        }
        catch (error) {
            logger_1.logger.error(`Notification failed: ${error}`);
        }
    }
}
