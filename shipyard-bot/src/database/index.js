// src/database/index.js - Database Connection and Schema Management
import sqlite3 from 'sqlite3';
import { Logger } from '../utils/Logger.js';

const { Database: SQLiteDB } = sqlite3.verbose();

export class Database {
    constructor() {
        this.logger = new Logger();
        this.db = null;
    }

    async connect() {
        const dbPath = process.env.DATABASE_URL.replace('sqlite://', '');
        
        return new Promise((resolve, reject) => {
            this.db = new SQLiteDB(dbPath, (err) => {
                if (err) {
                    this.logger.error('Database connection failed:', err);
                    reject(err);
                } else {
                    this.logger.success('SQLite database connected successfully');
                    resolve();
                }
            });
        });
    }

    async runMigrations() {
        try {
            const { SQLITE_MIGRATIONS } = await import('./sqlite-schema.js');
            
            // Create essential tables for SQLite
            await SQLITE_MIGRATIONS.createUsersTable(this);
            await SQLITE_MIGRATIONS.createMessagesTable(this);
            await SQLITE_MIGRATIONS.createMeetsTable(this);
            await SQLITE_MIGRATIONS.createGamificationTables(this);
            await SQLITE_MIGRATIONS.createPoliciesTable(this);
            
            this.logger.success('SQLite database migrations completed');
        } catch (error) {
            this.logger.error('Migration failed:', error);
            throw error;
        }
    }

    async createUsersTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                timezone TEXT,
                roles TEXT,
                away_until DATETIME,
                x_profile TEXT,
                skills TEXT,
                offer TEXT,
                need TEXT,
                intro_post_id TEXT,
                last_activity_at DATETIME,
                deleted_at DATETIME,
                dm_open INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`;
        await this.query(query);
    }

    async createMessagesTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
                channel_id VARCHAR(255) NOT NULL,
                message_id VARCHAR(255) UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                type VARCHAR(50) CHECK (type IN ('build_log', 'clinic_feedback', 'help_request', 'showcase', 'dock_check', 'other'))
            )`;
        await this.pool.query(query);
    }

    async createMeetsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS meets (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                start_at TIMESTAMP NOT NULL,
                duration_mins INTEGER DEFAULT 60,
                rsvp_message_id VARCHAR(255),
                notes_message_id VARCHAR(255),
                status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'closed', 'completed')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS meet_rsvps (
                meet_id INTEGER REFERENCES meets(id) ON DELETE CASCADE,
                user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
                status VARCHAR(10) CHECK (status IN ('yes', 'no', 'maybe')),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (meet_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS meet_attendance (
                meet_id INTEGER REFERENCES meets(id) ON DELETE CASCADE,
                user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
                attended BOOLEAN DEFAULT false,
                reason VARCHAR(255),
                PRIMARY KEY (meet_id, user_id)
            )`;
        await this.pool.query(query);
    }

    async createClinicsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS clinics (
                id SERIAL PRIMARY KEY,
                author_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
                message_id VARCHAR(255) UNIQUE,
                goal TEXT,
                draft TEXT,
                questions TEXT[],
                ask TEXT,
                status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'solved')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                solved_at TIMESTAMP,
                helpful_count INTEGER DEFAULT 0
            )`;
        await this.pool.query(query);
    }

    async createHelpRequestsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS help_requests (
                id SERIAL PRIMARY KEY,
                author_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
                message_id VARCHAR(255) UNIQUE,
                category VARCHAR(100),
                tags TEXT[],
                summary TEXT,
                urgency VARCHAR(20) DEFAULT 'normal',
                status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'solved')),
                solved_by VARCHAR(255) REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                solved_at TIMESTAMP
            )`;
        await this.pool.query(query);
    }

    async createDemosTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS demos (
                id SERIAL PRIMARY KEY,
                author_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
                message_id VARCHAR(255) UNIQUE,
                week_key DATE,
                in_queue BOOLEAN DEFAULT false,
                showcased_at TIMESTAMP,
                priority INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`;
        await this.pool.query(query);
    }

    async createKudosTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS kudos (
                id SERIAL PRIMARY KEY,
                giver_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
                receiver_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
                reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`;
        await this.pool.query(query);
    }

    async createPoliciesTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS policies (
                key VARCHAR(255) PRIMARY KEY,
                value JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Insert default policies
            INSERT INTO policies (key, value) VALUES
                ('gamification.enabled', 'true'),
                ('season.length_weeks', '6'),
                ('weekly_goal.required_actions', '2'),
                ('points.per_action', '1'),
                ('points.max_per_week', '3'),
                ('points.meet_attendance_bonus', '1'),
                ('points.demo_presented_bonus', '1'),
                ('leaderboard.public', 'false'),
                ('nudge.quiet_days', '10'),
                ('clinic.helpful_required', 'true'),
                ('dock.time', '"09:00"'),
                ('timezone', '"Europe/London"')
            ON CONFLICT (key) DO NOTHING`;
        await this.pool.query(query);
    }

    async createReportsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY,
                reporter_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
                target_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
                reason TEXT,
                evidence_thread_id VARCHAR(255),
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP
            )`;
        await this.pool.query(query);
    }

    async createConsentsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS consents (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(255) NOT NULL,
                user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
                consent BOOLEAN DEFAULT false,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`;
        await this.pool.query(query);
    }

    async createAnalyticsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS analytics_snapshots (
                id SERIAL PRIMARY KEY,
                week_start DATE NOT NULL,
                active_percent DECIMAL(5,2),
                new_members INTEGER DEFAULT 0,
                active_weeks_count INTEGER DEFAULT 0,
                weekly_streak_leaders JSONB,
                clinics_given INTEGER DEFAULT 0,
                help_requests_solved INTEGER DEFAULT 0,
                demos_posted INTEGER DEFAULT 0,
                meet_attendance_rate DECIMAL(5,2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`;
        await this.pool.query(query);
    }

    async createGamificationTables() {
        const query = `
            -- Seasons table
            CREATE TABLE IF NOT EXISTS seasons (
                id SERIAL PRIMARY KEY,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'closed')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Scores table
            CREATE TABLE IF NOT EXISTS scores (
                user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
                season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
                points INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, season_id)
            );

            -- Actions log
            CREATE TABLE IF NOT EXISTS actions_log (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
                type VARCHAR(50) CHECK (type IN ('dock', 'meet_attend', 'demo_posted', 'demo_presented', 'clinic_helpful', 'help_solved')),
                ref_message_id VARCHAR(255),
                ref_user_id VARCHAR(255),
                points INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                season_id INTEGER REFERENCES seasons(id),
                week_key DATE
            );

            -- Streaks table
            CREATE TABLE IF NOT EXISTS streaks (
                user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE PRIMARY KEY,
                weekly_current INTEGER DEFAULT 0,
                weekly_best INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_week_achieved DATE
            );

            -- Badges table
            CREATE TABLE IF NOT EXISTS badges (
                id SERIAL PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                label VARCHAR(255) NOT NULL,
                description TEXT,
                seasonal BOOLEAN DEFAULT false
            );

            -- User badges table
            CREATE TABLE IF NOT EXISTS user_badges (
                user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
                badge_id INTEGER REFERENCES badges(id) ON DELETE CASCADE,
                season_id INTEGER REFERENCES seasons(id),
                awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, badge_id, COALESCE(season_id, 0))
            );

            -- Insert default badges
            INSERT INTO badges (code, label, description, seasonal) VALUES
                ('first_dock', 'First Dock', 'Posted your first Dock Check', false),
                ('first_demo', 'First Demo', 'Posted your first demo', false),
                ('clinic_helper_5', 'Clinic Helper', 'Gave 5 helpful feedback responses', false),
                ('problem_solver_5', 'Problem Solver', 'Solved 5 help requests', false),
                ('streak_4_weeks', '4 Week Streak', 'Maintained a 4-week activity streak', false),
                ('meet_regular_4', 'Meet Regular', 'Attended 4 weekly meetings', false)
            ON CONFLICT (code) DO NOTHING`;
        await this.pool.query(query);
    }

    async query(text, params = []) {
        return new Promise((resolve, reject) => {
            if (text.trim().toUpperCase().startsWith('SELECT')) {
                this.db.all(text, params, (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ rows });
                    }
                });
            } else {
                this.db.run(text, params, function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ 
                            rows: [],
                            lastID: this.lastID,
                            changes: this.changes 
                        });
                    }
                });
            }
        });
    }

    async transaction(callback) {
        await this.query('BEGIN');
        try {
            const result = await callback(this);
            await this.query('COMMIT');
            return result;
        } catch (error) {
            await this.query('ROLLBACK');
            throw error;
        }
    }

    async disconnect() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        this.logger.error('Error closing database:', err);
                    } else {
                        this.logger.info('SQLite database disconnected');
                    }
                    resolve();
                });
            });
        }
    }
}