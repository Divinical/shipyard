// src/database/index.js - Database Connection and Schema Management
import Database from 'better-sqlite3';
import { Logger } from '../utils/Logger.js';
import path from 'path';

export class DatabaseConnection {
    constructor() {
        this.logger = new Logger();
        this.db = null;
        this.preparedStatements = new Map();
    }

    connect() {
        try {
            const dbPath = process.env.DATABASE_URL?.replace('sqlite://', '') || './shipyard.db';
            const resolvedPath = path.resolve(dbPath);
            
            this.db = new Database(resolvedPath);
            
            // Apply comprehensive SQLite optimizations
            this.applyOptimizations();
            
            this.logger.success('Better-SQLite3 database connected successfully');
        } catch (error) {
            this.logger.error('Database connection failed:', error);
            throw error;
        }
    }

    async runMigrations() {
        try {
            // Import migrations first
            const { SQLITE_MIGRATIONS } = await import('./sqlite-schema.js');
            
            // Run all migrations in a transaction
            const migrationTransaction = this.db.transaction(() => {
                // Create all tables
                SQLITE_MIGRATIONS.createUsersTable(this);
                SQLITE_MIGRATIONS.createMessagesTable(this);
                SQLITE_MIGRATIONS.createMeetsTable(this);
                SQLITE_MIGRATIONS.createClinicsTable(this);
                SQLITE_MIGRATIONS.createHelpRequestsTable(this);
                SQLITE_MIGRATIONS.createDemosTable(this);
                SQLITE_MIGRATIONS.createKudosTable(this);
                SQLITE_MIGRATIONS.createReportsTable(this);
                SQLITE_MIGRATIONS.createConsentsTable(this);
                SQLITE_MIGRATIONS.createAnalyticsSnapshotsTable(this);
                SQLITE_MIGRATIONS.createGamificationTables(this);
                SQLITE_MIGRATIONS.createPoliciesTable(this);
                
                // Create indexes
                SQLITE_MIGRATIONS.createIndexes(this);
                
                // Apply optimizations and maintenance
                SQLITE_MIGRATIONS.optimizePragmas(this);
            });
            
            migrationTransaction();
            this.logger.success('SQLite database migrations completed');
        } catch (error) {
            this.logger.error('Migration failed:', error);
            throw error;
        }
    }

    applyOptimizations() {
        try {
            // Import and apply SQLite optimizations
            const optimizations = [
                'PRAGMA foreign_keys = ON',
                'PRAGMA journal_mode = WAL',
                'PRAGMA synchronous = NORMAL',
                'PRAGMA cache_size = -32000', // 32MB cache
                'PRAGMA mmap_size = 268435456', // 256MB memory-mapped I/O
                'PRAGMA page_size = 4096',
                'PRAGMA auto_vacuum = INCREMENTAL',
                'PRAGMA temp_store = MEMORY',
                'PRAGMA busy_timeout = 30000', // 30 second timeout
                'PRAGMA optimize = 0x10002'
            ];

            for (const pragma of optimizations) {
                try {
                    this.db.pragma(pragma.replace('PRAGMA ', ''));
                } catch (error) {
                    this.logger.warn(`Failed to apply optimization: ${pragma}`, error.message);
                }
            }
        } catch (error) {
            this.logger.warn('Failed to apply some optimizations:', error);
        }
    }

    // Main query method - maintains backward compatibility with async interface
    async query(text, params = []) {
        return this.querySync(text, params);
    }

    // Synchronous query method with retry logic for better performance
    querySync(text, params = [], retryCount = 0) {
        const maxRetries = 3;
        const retryDelayMs = 100;

        try {
            const trimmedQuery = text.trim().toUpperCase();
            
            if (trimmedQuery.startsWith('SELECT')) {
                const stmt = this.db.prepare(text);
                const rows = stmt.all(params);
                return { rows };
            } else if (trimmedQuery.startsWith('INSERT')) {
                const stmt = this.db.prepare(text);
                const result = stmt.run(params);
                return { 
                    rows: [], 
                    lastID: result.lastInsertRowid,
                    changes: result.changes 
                };
            } else if (trimmedQuery.startsWith('UPDATE') || trimmedQuery.startsWith('DELETE')) {
                const stmt = this.db.prepare(text);
                const result = stmt.run(params);
                return { 
                    rows: [], 
                    changes: result.changes 
                };
            } else {
                // For CREATE, DROP, etc.
                const stmt = this.db.prepare(text);
                stmt.run(params);
                return { rows: [] };
            }
        } catch (error) {
            // Retry logic for SQLITE_BUSY errors
            if (error.code === 'SQLITE_BUSY' && retryCount < maxRetries) {
                this.logger.warn(`Database busy, retrying (${retryCount + 1}/${maxRetries})...`);
                
                // Exponential backoff
                const delay = retryDelayMs * Math.pow(2, retryCount);
                this.sleep(delay);
                
                return this.querySync(text, params, retryCount + 1);
            }
            
            this.logger.error('Query failed:', error, { query: text, params, retryCount });
            throw error;
        }
    }

    // Helper method for sleep in retry logic
    sleep(ms) {
        const start = Date.now();
        while (Date.now() - start < ms) {
            // Busy wait for small delays
        }
    }

    // Optimized prepared statement caching
    prepare(query) {
        if (!this.preparedStatements.has(query)) {
            this.preparedStatements.set(query, this.db.prepare(query));
        }
        return this.preparedStatements.get(query);
    }

    // Transaction wrapper - maintains backward compatibility
    async transaction(callback) {
        return this.transactionSync(callback);
    }

    // Synchronous transaction for better performance
    transactionSync(callback) {
        const transaction = this.db.transaction((db) => {
            return callback(this);
        });
        
        return transaction();
    }

    // Helper method to get last insert ID (replaces RETURNING *)
    getLastInsertId() {
        const result = this.db.prepare('SELECT last_insert_rowid() as id').get();
        return result.id;
    }

    // Helper method to format arrays as JSON strings
    formatArray(arr) {
        if (!Array.isArray(arr)) return arr;
        return JSON.stringify(arr);
    }

    // Helper method to parse JSON strings back to arrays
    parseArray(str) {
        if (!str || typeof str !== 'string') return [];
        try {
            const parsed = JSON.parse(str);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            this.logger.warn('Failed to parse array from JSON:', str);
            return [];
        }
    }

    // Helper method to format objects as JSON strings
    formatObject(obj) {
        if (typeof obj !== 'object' || obj === null) return obj;
        return JSON.stringify(obj);
    }

    // Helper method to parse JSON strings back to objects
    parseObject(str) {
        if (!str || typeof str !== 'string') return null;
        try {
            return JSON.parse(str);
        } catch (error) {
            this.logger.warn('Failed to parse object from JSON:', str);
            return null;
        }
    }

    // Helper method for SQLite date handling
    formatDate(date) {
        if (!date) return null;
        if (date instanceof Date) {
            return date.toISOString();
        }
        return date;
    }

    // Batch operations for better performance
    insertMany(table, columns, rows) {
        const placeholders = columns.map(() => '?').join(', ');
        const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
        const stmt = this.prepare(query);
        
        const insertMany = this.db.transaction((rows) => {
            for (const row of rows) {
                stmt.run(row);
            }
        });
        
        return insertMany(rows);
    }

    // Batch SELECT operations to reduce N+1 queries
    selectMany(table, column, values, additionalColumns = '*') {
        if (!values || values.length === 0) return { rows: [] };
        
        const placeholders = values.map(() => '?').join(', ');
        const query = `SELECT ${additionalColumns} FROM ${table} WHERE ${column} IN (${placeholders})`;
        
        return this.querySync(query, values);
    }

    // Batch user lookups - common operation
    batchGetUsers(userIds) {
        if (!userIds || userIds.length === 0) return { rows: [] };
        
        return this.selectMany('users', 'id', userIds);
    }

    // Batch message lookups
    batchGetMessages(messageIds) {
        if (!messageIds || messageIds.length === 0) return { rows: [] };
        
        return this.selectMany('messages', 'message_id', messageIds);
    }

    // Get user scores for leaderboard efficiently
    getLeaderboard(seasonId, limit = 10) {
        const query = `
            SELECT s.user_id, s.points, u.username
            FROM scores s
            JOIN users u ON s.user_id = u.id
            WHERE s.season_id = ? AND u.deleted_at IS NULL
            ORDER BY s.points DESC, s.updated_at ASC
            LIMIT ?
        `;
        
        return this.querySync(query, [seasonId, limit]);
    }

    // Get user actions efficiently with JOINs
    getUserActionsWithDetails(userId, seasonId, limit = 50) {
        const query = `
            SELECT 
                al.type,
                al.points,
                al.created_at,
                al.week_key,
                u2.username as ref_user_name
            FROM actions_log al
            LEFT JOIN users u2 ON al.ref_user_id = u2.id
            WHERE al.user_id = ? AND al.season_id = ?
            ORDER BY al.created_at DESC
            LIMIT ?
        `;
        
        return this.querySync(query, [userId, seasonId, limit]);
    }

    // Efficient clinic statistics
    getClinicStats(authorId = null, days = 30) {
        const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        
        let query = `
            SELECT 
                c.status,
                COUNT(*) as count,
                AVG(c.helpful_count) as avg_helpful_count
            FROM clinics c
            WHERE c.created_at >= ?
        `;
        
        let params = [dateLimit];
        
        if (authorId) {
            query += ' AND c.author_id = ?';
            params.push(authorId);
        }
        
        query += ' GROUP BY c.status';
        
        return this.querySync(query, params);
    }

    // Efficient meet attendance tracking
    getMeetAttendanceStats(userId = null, months = 3) {
        const dateLimit = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString();
        
        let query = `
            SELECT 
                m.title,
                m.start_at,
                ma.attended,
                COUNT(ma2.user_id) as total_attendees
            FROM meets m
            LEFT JOIN meet_attendance ma ON m.id = ma.meet_id
            LEFT JOIN meet_attendance ma2 ON m.id = ma2.meet_id AND ma2.attended = 1
            WHERE m.start_at >= ?
        `;
        
        let params = [dateLimit];
        
        if (userId) {
            query += ' AND ma.user_id = ?';
            params.push(userId);
        }
        
        query += ' GROUP BY m.id ORDER BY m.start_at DESC';
        
        return this.querySync(query, params);
    }

    // Database health check
    healthCheck() {
        try {
            const result = this.db.prepare('SELECT 1 as healthy').get();
            return result.healthy === 1;
        } catch (error) {
            this.logger.error('Health check failed:', error);
            return false;
        }
    }

    // Get database statistics
    getStats() {
        try {
            const stats = {};
            
            // Get table counts
            const tables = this.db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name
            `).all();
            
            for (const table of tables) {
                const count = this.db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
                stats[table.name] = count.count;
            }
            
            // Get database size
            const size = this.db.prepare('PRAGMA page_count').get();
            const pageSize = this.db.prepare('PRAGMA page_size').get();
            stats.database_size_bytes = size.page_count * pageSize.page_size;
            
            return stats;
        } catch (error) {
            this.logger.error('Failed to get database stats:', error);
            return {};
        }
    }

    // Run maintenance tasks for optimal performance
    runMaintenance() {
        try {
            this.logger.info('Running database maintenance...');
            
            // Import maintenance tasks from schema
            import('./sqlite-schema.js').then(({ SQLITE_MIGRATIONS }) => {
                SQLITE_MIGRATIONS.scheduleMaintenanceTasks(this);
            });
            
            // Additional maintenance
            this.db.pragma('analysis_limit = 1000');
            this.db.pragma('optimize');
            
            this.logger.success('Database maintenance completed');
        } catch (error) {
            this.logger.error('Database maintenance failed:', error);
        }
    }

    // Get detailed performance statistics
    getPerformanceStats() {
        try {
            const stats = {};
            
            // Get cache hit ratio
            const cacheStats = this.db.pragma('cache_size');
            stats.cache_size = cacheStats;
            
            // Get journal mode
            const journalMode = this.db.pragma('journal_mode');
            stats.journal_mode = journalMode;
            
            // Get WAL checkpoint info
            try {
                const walInfo = this.db.pragma('wal_checkpoint(PASSIVE)');
                stats.wal_checkpoint = walInfo;
            } catch (e) {
                // WAL not enabled
                stats.wal_checkpoint = 'N/A';
            }
            
            // Get query analysis
            const queryPlan = this.db.prepare('EXPLAIN QUERY PLAN SELECT COUNT(*) FROM users').all();
            stats.sample_query_plan = queryPlan;
            
            return stats;
        } catch (error) {
            this.logger.error('Failed to get performance stats:', error);
            return {};
        }
    }

    disconnect() {
        if (this.db) {
            try {
                // Clear prepared statements cache
                this.preparedStatements.clear();
                
                // Close database connection
                this.db.close();
                this.db = null;
                
                this.logger.info('Better-SQLite3 database disconnected');
            } catch (error) {
                this.logger.error('Error closing database:', error);
            }
        }
    }
}

// Export singleton instance for backward compatibility
let dbInstance = null;

export function getDatabase() {
    if (!dbInstance) {
        dbInstance = new DatabaseConnection();
    }
    return dbInstance;
}

// Export class as default for direct instantiation
export { DatabaseConnection as Database };