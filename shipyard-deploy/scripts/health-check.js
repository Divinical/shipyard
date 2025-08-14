// scripts/health-check.js
import { config } from 'dotenv';
import { DatabaseConnection } from '../src/database/index.js';
import chalk from 'chalk';

config();

async function healthCheck() {
    const db = new DatabaseConnection();
    
    try {
        console.log(chalk.blue('Running health check...'));
        
        // Check database connection
        db.connect();
        console.log(chalk.green('✓ Database connection'));
        
        // Check tables exist
        const tables = await db.query(`
            SELECT COUNT(*) as count 
            FROM sqlite_master 
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        `);
        console.log(chalk.green(`✓ Database tables: ${tables.rows[0].count}`));
        
        // Check user count
        const users = await db.query('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL');
        console.log(chalk.cyan(`  Users: ${users.rows[0].count}`));
        
        // Check active season
        const season = await db.query("SELECT * FROM seasons WHERE status = 'active'");
        if (season.rows.length > 0) {
            const endDate = new Date(season.rows[0].end_date);
            const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
            console.log(chalk.cyan(`  Active season: ${daysLeft} days remaining`));
        } else {
            console.log(chalk.yellow('  ⚠ No active season'));
        }
        
        // Check recent activity
        const recentMessages = await db.query(
            "SELECT COUNT(*) as count FROM messages WHERE created_at > datetime('now', '-24 hours')"
        );
        console.log(chalk.cyan(`  Messages (24h): ${recentMessages.rows[0].count}`));
        
        // Check for errors
        const recentErrors = await db.query(
            "SELECT COUNT(*) as count FROM reports WHERE created_at > datetime('now', '-24 hours') AND status = 'pending'"
        );
        if (parseInt(recentErrors.rows[0].count) > 0) {
            console.log(chalk.yellow(`  ⚠ Pending reports: ${recentErrors.rows[0].count}`));
        }
        
        console.log(chalk.green('\n✓ Health check complete - System healthy'));
        
    } catch (error) {
        console.error(chalk.red('Health check failed:'), error);
        process.exit(1);
    } finally {
        db.disconnect();
    }
}

healthCheck();