// scripts/migrate.js
import { config } from 'dotenv';
import { DatabaseConnection } from '../src/database/index.js';
import chalk from 'chalk';

config();

async function migrate() {
    const db = new DatabaseConnection();
    
    try {
        console.log(chalk.blue('Connecting to database...'));
        db.connect();
        console.log(chalk.green('✓ Connected'));
        
        console.log(chalk.blue('Running migrations...'));
        await db.runMigrations();
        console.log(chalk.green('✓ Migrations completed'));
        
        // Verify tables (SQLite)
        console.log(chalk.blue('Verifying tables...'));
        const tables = await db.query(`
            SELECT name as table_name
            FROM sqlite_master 
            WHERE type='table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        `);
        
        console.log(chalk.cyan('Created tables:'));
        tables.rows.forEach(row => {
            console.log(chalk.gray(`  - ${row.table_name}`));
        });
        
        console.log(chalk.green('\n✓ Database setup complete!'));
    } catch (error) {
        console.error(chalk.red('Migration failed:'), error);
        process.exit(1);
    } finally {
        db.disconnect();
    }
}

migrate();
