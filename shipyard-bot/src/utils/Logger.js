// src/utils/Logger.js
import chalk from 'chalk';

export class Logger {
    constructor(name = 'ShipYard') {
        this.name = name;
    }

    info(message, ...args) {
        console.log(chalk.blue(`[${this.name}] INFO:`), message, ...args);
    }

    warn(message, ...args) {
        console.log(chalk.yellow(`[${this.name}] WARN:`), message, ...args);
    }

    error(message, ...args) {
        console.log(chalk.red(`[${this.name}] ERROR:`), message, ...args);
    }

    success(message, ...args) {
        console.log(chalk.green(`[${this.name}] SUCCESS:`), message, ...args);
    }

    debug(message, ...args) {
        if (process.env.NODE_ENV === 'development') {
            console.log(chalk.gray(`[${this.name}] DEBUG:`), message, ...args);
        }
    }
}