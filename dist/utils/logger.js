"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.createLogger = createLogger;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const LOGS_PATH = path_1.default.join(__dirname, '../../logs');
/**
 * Инициализирует логгер.
 * @returns {winston.Logger} Инстанс логгера.
 */
function createLogger() {
    // Комментарий: Создаём директорию logs, если нет.
    if (!fs_1.default.existsSync(LOGS_PATH)) {
        fs_1.default.mkdirSync(LOGS_PATH);
    }
    return winston_1.default.createLogger({
        level: 'info',
        format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
        transports: [
            new winston_1.default.transports.Console(), // Консоль для dev
            new winston_1.default.transports.File({ filename: path_1.default.join(LOGS_PATH, 'error.log'), level: 'error' }),
            new winston_1.default.transports.File({ filename: path_1.default.join(LOGS_PATH, 'combined.log') })
        ]
    });
}
// Глобальный логгер (singleton для DRY)
exports.logger = createLogger();
