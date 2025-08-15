// src/database/index.js - Database Connection and Schema Management
  import sqlite3 from 'sqlite3';
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

              this.db = new sqlite3.Database(resolvedPath, (err) => {
                  if (err) {
                      this.logger.error('Database connection failed:', err);
                      throw err;
                  }
              });

              // Apply comprehensive SQLite optimizations
              this.applyOptimizations();

              this.logger.success('SQLite database connected successfully');
          } catch (error) {
              this.logger.error('Database connection failed:', error);
              throw error;
          }
      }

      async runMigrations() {
          try {
              // Import migrations first
              const { SQLITE_MIGRATIONS } = await import('./sqlite-schema.js');

              // Create all tables (can be in transaction)
              await this.transactionSync(async () => {
                  await SQLITE_MIGRATIONS.createUsersTable(this);
                  await SQLITE_MIGRATIONS.createMessagesTable(this);
                  await SQLITE_MIGRATIONS.createMeetsTable(this);
                  await SQLITE_MIGRATIONS.createClinicsTable(this);
                  await SQLITE_MIGRATIONS.createHelpRequestsTable(this);
                  await SQLITE_MIGRATIONS.createDemosTable(this);
                  await SQLITE_MIGRATIONS.createKudosTable(this);
                  await SQLITE_MIGRATIONS.createReportsTable(this);
                  await SQLITE_MIGRATIONS.createConsentsTable(this);
                  await SQLITE_MIGRATIONS.createAnalyticsSnapshotsTable(this);
                  await SQLITE_MIGRATIONS.createGamificationTables(this);
                  await SQLITE_MIGRATIONS.createPoliciesTable(this);
              });

              // Create indexes (separate transaction)
              await SQLITE_MIGRATIONS.createIndexes(this);

              // Apply PRAGMA optimizations (MUST be outside transaction)
              await SQLITE_MIGRATIONS.optimizePragmas(this);

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
                      this.db.run(pragma, (err) => {
                          if (err) {
                              this.logger.warn(`Failed to apply optimization: ${pragma}`, err.message);
                          }
                      });
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
          return new Promise((resolve, reject) => {
              const maxRetries = 3;
              const retryDelayMs = 100;

              try {
                  const trimmedQuery = text.trim().toUpperCase();

                  if (trimmedQuery.startsWith('SELECT')) {
                      this.db.all(text, params, (err, rows) => {
                          if (err) {
                              this.handleQueryError(err, text, params, retryCount, maxRetries, retryDelayMs, resolve, reject);
                          } else {
                              resolve({ rows });
                          }
                      });
                  } else if (trimmedQuery.startsWith('INSERT')) {
                      this.db.run(text, params, (err) => {
                          if (err) {
                              this.handleQueryError(err, text, params, retryCount, maxRetries, retryDelayMs, resolve, reject);
                          } else {
                              // For INSERT, we need to get lastID from the database context
                              this.db.get('SELECT last_insert_rowid() as lastID', (err2, row) => {
                                  if (err2) {
                                      resolve({
                                          rows: [],
                                          lastID: null,
                                          changes: 1
                                      });
                                  } else {
                                      resolve({
                                          rows: [],
                                          lastID: row ? row.lastID : null,
                                          changes: 1
                                      });
                                  }
                              });
                          }
                      });
                  } else if (trimmedQuery.startsWith('UPDATE') || trimmedQuery.startsWith('DELETE')) {
                      this.db.run(text, params, (err) => {
                          if (err) {
                              this.handleQueryError(err, text, params, retryCount, maxRetries, retryDelayMs, resolve, reject);
                          } else {
                              resolve({
                                  rows: [],
                                  changes: 1
                              });
                          }
                      });
                  } else {
                      // For CREATE, DROP, etc.
                      this.db.run(text, params, (err) => {
                          if (err) {
                              this.handleQueryError(err, text, params, retryCount, maxRetries, retryDelayMs, resolve, reject);
                          } else {
                              resolve({ rows: [] });
                          }
                      });
                  }
              } catch (error) {
                  this.handleQueryError(error, text, params, retryCount, maxRetries, retryDelayMs, resolve, reject);
              }
          });
      }

      // Helper method for error handling with retry logic
      handleQueryError(error, text, params, retryCount, maxRetries, retryDelayMs, resolve, reject) {
          // Retry logic for SQLITE_BUSY errors
          if (error.code === 'SQLITE_BUSY' && retryCount < maxRetries) {
              this.logger.warn(`Database busy, retrying (${retryCount + 1}/${maxRetries})...`);

              // Exponential backoff
              const delay = retryDelayMs * Math.pow(2, retryCount);
              setTimeout(() => {
                  this.querySync(text, params, retryCount + 1).then(resolve).catch(reject);
              }, delay);
          } else {
              this.logger.error('Query failed:', error, { query: text, params, retryCount });
              reject(error);
          }
      }

      // Helper method for sleep in retry logic
      sleep(ms) {
          const start = Date.now();
          while (Date.now() - start < ms) {
              // Busy wait for small delays
          }
      }

      // Optimized prepared statement caching (simplified for sqlite3)
      prepare(query) {
          // sqlite3 doesn't support prepared statements the same way
          // Return a wrapper that uses the db.run/all methods
          return {
              run: (params, callback) => this.db.run(query, params, callback),
              all: (params, callback) => this.db.all(query, params, callback),
              get: (params, callback) => this.db.get(query, params, callback)
          };
      }

      // Transaction wrapper - maintains backward compatibility
      async transaction(callback) {
          return this.transactionSync(callback);
      }

      // Synchronous transaction for better performance
      transactionSync(callback) {
          return new Promise((resolve, reject) => {
              this.db.serialize(() => {
                  this.db.run("BEGIN TRANSACTION", (err) => {
                      if (err) {
                          reject(err);
                          return;
                      }

                      try {
                          const result = callback(this);
                          if (result && typeof result.then === 'function') {
                              // Handle async callback
                              result.then(() => {
                                  this.db.run("COMMIT", (err) => {
                                      if (err) {
                                          this.db.run("ROLLBACK");
                                          reject(err);
                                      } else {
                                          resolve(result);
                                      }
                                  });
                              }).catch((error) => {
                                  this.db.run("ROLLBACK");
                                  reject(error);
                              });
                          } else {
                              // Handle sync callback
                              this.db.run("COMMIT", (err) => {
                                  if (err) {
                                      this.db.run("ROLLBACK");
                                      reject(err);
                                  } else {
                                      resolve(result);
                                  }
                              });
                          }
                      } catch (error) {
                          this.db.run("ROLLBACK");
                          reject(error);
                      }
                  });
              });
          });
      }

      // Helper method to get last insert ID (replaces RETURNING *)
      getLastInsertId() {
          return new Promise((resolve, reject) => {
              this.db.get('SELECT last_insert_rowid() as id', (err, result) => {
                  if (err) {
                      reject(err);
                  } else {
                      resolve(result.id);
                  }
              });
          });
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
      async insertMany(table, columns, rows) {
          const placeholders = columns.map(() => '?').join(', ');
          const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

          return this.transactionSync(() => {
              const promises = rows.map(row => this.querySync(query, row));
              return Promise.all(promises);
          });
      }

      // Batch SELECT operations to reduce N+1 queries
      selectMany(table, column, values, additionalColumns = '*') {
          if (!values || values.length === 0) return Promise.resolve({ rows: [] });

          const placeholders = values.map(() => '?').join(', ');
          const query = `SELECT ${additionalColumns} FROM ${table} WHERE ${column} IN (${placeholders})`;

          return this.querySync(query, values);
      }

      // Batch user lookups - common operation
      batchGetUsers(userIds) {
          if (!userIds || userIds.length === 0) return Promise.resolve({ rows: [] });

          return this.selectMany('users', 'id', userIds);
      }

      // Batch message lookups
      batchGetMessages(messageIds) {
          if (!messageIds || messageIds.length === 0) return Promise.resolve({ rows: [] });

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
          return new Promise((resolve) => {
              try {
                  this.db.get('SELECT 1 as healthy', (err, result) => {
                      if (err) {
                          this.logger.error('Health check failed:', err);
                          resolve(false);
                      } else {
                          resolve(result.healthy === 1);
                      }
                  });
              } catch (error) {
                  this.logger.error('Health check failed:', error);
                  resolve(false);
              }
          });
      }

      // Get database statistics
      getStats() {
          return new Promise((resolve) => {
              try {
                  const stats = {};

                  // Get table counts
                  this.db.all(`
                      SELECT name FROM sqlite_master
                      WHERE type='table' AND name NOT LIKE 'sqlite_%'
                      ORDER BY name
                  `, (err, tables) => {
                      if (err) {
                          this.logger.error('Failed to get database stats:', err);
                          resolve({});
                          return;
                      }

                      const promises = tables.map(table => {
                          return new Promise((resolveTable) => {
                              this.db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, result) => {
                                  if (err) {
                                      stats[table.name] = 0;
                                  } else {
                                      stats[table.name] = result.count;
                                  }
                                  resolveTable();
                              });
                          });
                      });

                      Promise.all(promises).then(() => {
                          // Get database size
                          this.db.get('PRAGMA page_count', (err, size) => {
                              if (!err) {
                                  this.db.get('PRAGMA page_size', (err, pageSize) => {
                                      if (!err) {
                                          stats.database_size_bytes = size.page_count * pageSize.page_size;
                                      }
                                      resolve(stats);
                                  });
                              } else {
                                  resolve(stats);
                              }
                          });
                      });
                  });
              } catch (error) {
                  this.logger.error('Failed to get database stats:', error);
                  resolve({});
              }
          });
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
              this.db.run('PRAGMA analysis_limit = 1000');
              this.db.run('PRAGMA optimize');

              this.logger.success('Database maintenance completed');
          } catch (error) {
              this.logger.error('Database maintenance failed:', error);
          }
      }

      // Get detailed performance statistics
      getPerformanceStats() {
          return new Promise((resolve) => {
              try {
                  const stats = {};

                  // Get cache hit ratio
                  this.db.get('PRAGMA cache_size', (err, result) => {
                      if (!err) stats.cache_size = [result];

                      // Get journal mode
                      this.db.get('PRAGMA journal_mode', (err, result) => {
                          if (!err) stats.journal_mode = [result];

                          // Get WAL checkpoint info
                          this.db.get('PRAGMA wal_checkpoint(PASSIVE)', (err, result) => {
                              if (!err) {
                                  stats.wal_checkpoint = [result];
                              } else {
                                  stats.wal_checkpoint = 'N/A';
                              }

                              // Get query analysis
                              this.db.all('EXPLAIN QUERY PLAN SELECT COUNT(*) FROM users', (err, result) => {
                                  if (!err) stats.sample_query_plan = result;
                                  resolve(stats);
                              });
                          });
                      });
                  });
              } catch (error) {
                  this.logger.error('Failed to get performance stats:', error);
                  resolve({});
              }
          });
      }

      disconnect() {
          if (this.db) {
              try {
                  // Clear prepared statements cache
                  this.preparedStatements.clear();

                  // Close database connection
                  this.db.close((err) => {
                      if (err) {
                          this.logger.error('Error closing database:', err);
                      } else {
                          this.logger.info('SQLite database disconnected');
                      }
                  });
                  this.db = null;
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