// scripts/backup.js
import { config } from 'dotenv';
import { Database } from '../src/database/index.js';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

config();

async function backup() {
    const db = new Database();
    
    try {
        console.log(chalk.blue('Connecting to database...'));
        await db.connect();
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(process.cwd(), 'backups');
        const backupFile = path.join(backupDir, `backup-${timestamp}.json`);
        
        // Create backup directory if it doesn't exist
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        console.log(chalk.blue('Creating backup...'));
        
        const backup = {
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            tables: {}
        };
        
        // List of tables to backup
        const tables = [
            'users', 'messages', 'meets', 'meet_rsvps', 'meet_attendance',
            'clinics', 'help_requests', 'demos', 'kudos', 'policies',
            'reports', 'consents', 'analytics_snapshots', 'seasons',
            'scores', 'actions_log', 'streaks', 'badges', 'user_badges'
        ];
        
        for (const table of tables) {
            try {
                const result = await db.query(`SELECT * FROM ${table}`);
                backup.tables[table] = result.rows;
                console.log(chalk.gray(`  ✓ ${table}: ${result.rows.length} rows`));
            } catch (error) {
                console.log(chalk.yellow(`  ⚠ ${table}: ${error.message}`));
            }
        }
        
        // Write backup to file
        fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
        
        console.log(chalk.green(`\n✓ Backup saved to ${backupFile}`));
        
        // Clean old backups (keep last 30)
        const backups = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('backup-'))
            .sort()
            .reverse();
        
        if (backups.length > 30) {
            const toDelete = backups.slice(30);
            toDelete.forEach(file => {
                fs.unlinkSync(path.join(backupDir, file));
            });
            console.log(chalk.gray(`Cleaned ${toDelete.length} old backups`));
        }
        
    } catch (error) {
        console.error(chalk.red('Backup failed:'), error);
        process.exit(1);
    } finally {
        await db.disconnect();
    }
}

backup();