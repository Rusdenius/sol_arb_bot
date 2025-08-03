import { Telegraf, Context, Markup } from 'telegraf';  // Добавлен Markup для клавиатур
import { TELEGRAM_TOKEN } from '../utils/config';
import { logger } from '../utils/logger';
import { registerCommands } from './commands';  // Импорт обработчиков

// Глобальный бот (singleton для DRY)
let bot: Telegraf | null = null;

// Private menuMessageId (не экспортируем напрямую)
let menuMessageId: number | null = null;

/**
 * Set menuMessageId.
 * @param {number | null} id - Message ID.
 */
export function setMenuMessageId(id: number | null): void {
    menuMessageId = id;
}

/**
 * Get menuMessageId.
 * @returns {number | null} Message ID.
 */
export function getMenuMessageId(): number | null {
    return menuMessageId;
}

/**
 * Инициализирует и возвращает Telegram-бота.
 * @returns {Telegraf} Инстанс бота.
 */
export function initTelegramBot(): Telegraf {
    if (!TELEGRAM_TOKEN) {
        throw new Error('TELEGRAM_BOT_TOKEN not set in .env');
    }
    bot = new Telegraf(TELEGRAM_TOKEN);

    // Регистрация команд
    registerCommands(bot);

    // Обработка ошибок (стабильность)
    bot.catch((err: unknown, ctx: Context) => {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`Telegram error: ${errorMessage}`);
        ctx.reply('Произошла ошибка. Попробуйте позже.');
    });

    logger.info('Telegram bot initialized');
    return bot;
}

/**
 * Запускает бота (polling для сообщений).
 */
export async function startBot(): Promise<void> {
    const telegramBot = initTelegramBot();
    await telegramBot.launch();
    logger.info('Telegram bot started');
}

/**
 * Останавливает бота.
 */
export async function stopBot(): Promise<void> {
    if (bot) {
        await bot.stop();
        logger.info('Telegram bot stopped');
    }
}

/**
 * Отправляет уведомление в Telegram (e.g. о сделке или ошибке).
 * @param {string} chatId - ID чата (получайте из ctx.chat.id).
 * @param {string} message - Сообщение для отправки.
 */
export async function sendNotification(chatId: string, message: string): Promise<void> {
    if (bot) {
        try {
            await bot.telegram.sendMessage(chatId, message);
            logger.info(`Notification sent: ${message}`);
        } catch (error) {
            logger.error(`Notification failed: ${error}`);
        }
    }
}

// Экспорт Markup для использования в commands.ts
export { Markup };