// src/utils/Logger.js
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class Logger {
    constructor(options = {}) {
        this.logLevel = options.logLevel || process.env.LOG_LEVEL || 'info';
        this.logToFile = options.logToFile || process.env.LOG_TO_FILE === 'true';
        this.logFilePath = options.logFilePath || process.env.LOG_FILE_PATH || path.join(__dirname, '../../logs/bot.log');
        
        if (this.logToFile) {
            this.ensureLogDirectory();
        }
    }

    ensureLogDirectory() {
        const dir = path.dirname(this.logFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    log(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        // Console output with colors
        switch (level) {
            case 'error':
                console.error(chalk.red(formattedMessage), ...args);
                break;
            case 'warn':
                console.warn(chalk.yellow(formattedMessage), ...args);
                break;
            case 'info':
                console.info(chalk.blue(formattedMessage), ...args);
                break;
            case 'success':
                console.log(chalk.green(formattedMessage), ...args);
                break;
            case 'debug':
                if (this.logLevel === 'debug') {
                    console.log(chalk.gray(formattedMessage), ...args);
                }
                break;
            default:
                console.log(formattedMessage, ...args);
        }
        
        // File output
        if (this.logToFile) {
            const logEntry = `${formattedMessage} ${args.join(' ')}\n`;
            fs.appendFileSync(this.logFilePath, logEntry);
        }
    }

    error(message, ...args) {
        this.log('error', message, ...args);
    }

    warn(message, ...args) {
        this.log('warn', message, ...args);
    }

    info(message, ...args) {
        this.log('info', message, ...args);
    }

    success(message, ...args) {
        this.log('success', message, ...args);
    }

    debug(message, ...args) {
        this.log('debug', message, ...args);
    }
}

