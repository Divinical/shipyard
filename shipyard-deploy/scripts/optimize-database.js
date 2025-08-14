#!/usr/bin/env node

import { getDatabase } from '../src/database/index.js';
import { SQLITE_MIGRATIONS } from '../src/database/sqlite-schema.js';
import { Logger } from '../src/utils/Logger.js';

const logger = new Logger();

async function optimizeDatabase() {
    logger.info('Starting database optimization...');
    
    const db = getDatabase();
    
    try {
        // Connect to database
        db.connect();
        
        // Apply PRAGMA optimizations outside transaction (some can't be set inside transactions)
        logger.info('Applying PRAGMA optimizations...');
        SQLITE_MIGRATIONS.optimizePragmas(db);
        
        // Apply indexes and maintenance in a transaction
        const optimizeTransaction = db.db.transaction(() => {
            logger.info('Creating/updating indexes...');
            SQLITE_MIGRATIONS.createIndexes(db);
            
            logger.info('Running maintenance tasks...');
            SQLITE_MIGRATIONS.scheduleMaintenanceTasks(db);
        });
        
        optimizeTransaction();
        
        // Get performance stats
        const stats = db.getPerformanceStats();
        logger.info('Performance statistics:', stats);
        
        // Get database stats
        const dbStats = db.getStats();
        logger.info('Database statistics:', dbStats);
        
        logger.success('Database optimization completed successfully!');
        
        // Print optimization summary
        console.log(`
🚀 Optimization Summary:
========================
✅ Applied SQLite PRAGMA optimizations
✅ Created/updated performance indexes
✅ Ran maintenance tasks (VACUUM, ANALYZE)
✅ Database is now optimized for production use

📊 Current Settings:
- Journal Mode: ${stats.journal_mode[0]?.journal_mode || 'unknown'}
- Cache Size: ${Math.abs(stats.cache_size[0]?.cache_size || 0)} KB
- Total Tables: ${Object.keys(dbStats).length - 1}
- Database Size: ${Math.round(dbStats.database_size_bytes / 1024 / 1024 * 100) / 100} MB

💡 Next Steps:
- Monitor query performance with slow query logging
- Run this optimization script monthly for best performance
- Consider running maintenance during low-usage periods
        `);
        
    } catch (error) {
        logger.error('Database optimization failed:', error);
        process.exit(1);
    } finally {
        db.disconnect();
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    optimizeDatabase();
}

export { optimizeDatabase };