import winston from 'winston';
import path from 'path';
import fs from "fs";

const LOGS_PATH = path.join(__dirname, '../../logs');

/**
 * Инициализирует логгер.
 * @returns {winston.Logger} Инстанс логгера.
 */
export function createLogger(): winston.Logger {
    // Комментарий: Создаём директорию logs, если нет.
    if (!fs.existsSync(LOGS_PATH)) {
        fs.mkdirSync(LOGS_PATH);
    }
    return winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.Console(),  // Консоль для dev
            new winston.transports.File({ filename: path.join(LOGS_PATH, 'error.log'), level: 'error' }),
            new winston.transports.File({ filename: path.join(LOGS_PATH, 'combined.log') })
        ]
    });
}

// Глобальный логгер (singleton для DRY)
export const logger = createLogger();