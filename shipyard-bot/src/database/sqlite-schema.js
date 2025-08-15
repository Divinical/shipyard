// SQLite simplified schema for ShipYard Bot
export const SQLITE_MIGRATIONS = {
    async createUsersTable(db) {
        return await db.querySync(`
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
            )
        `);
    },

    async createMessagesTable(db) {
        return await db.querySync(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT REFERENCES users(id),
                channel_id TEXT NOT NULL,
                message_id TEXT UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                type TEXT CHECK (type IN ('build_log', 'clinic_feedback', 'help_request', 'showcase', 'dock_check', 'other'))
            )
        `);
    },

    async createMeetsTable(db) {
        await db.querySync(`
            CREATE TABLE IF NOT EXISTS meets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                start_at DATETIME NOT NULL,
                duration_mins INTEGER DEFAULT 60,
                rsvp_message_id TEXT,
                notes_message_id TEXT,
                status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'closed', 'completed')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.querySync(`
            CREATE TABLE IF NOT EXISTS meet_rsvps (
                meet_id INTEGER REFERENCES meets(id),
                user_id TEXT REFERENCES users(id),
                status TEXT CHECK (status IN ('yes', 'no', 'maybe')),
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (meet_id, user_id)
            )
        `);

        return await db.querySync(`
            CREATE TABLE IF NOT EXISTS meet_attendance (
                meet_id INTEGER REFERENCES meets(id),
                user_id TEXT REFERENCES users(id),
                attended INTEGER DEFAULT 0,
                reason TEXT,
                PRIMARY KEY (meet_id, user_id)
            )
        `);
    },

    async createGamificationTables(db) {
        await db.querySync(`
            CREATE TABLE IF NOT EXISTS seasons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'closed')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.querySync(`
            CREATE TABLE IF NOT EXISTS scores (
                user_id TEXT REFERENCES users(id),
                season_id INTEGER REFERENCES seasons(id),
                points INTEGER DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, season_id)
            )
        `);

        db.querySync(`
            CREATE TABLE IF NOT EXISTS actions_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT REFERENCES users(id),
                type TEXT CHECK (type IN ('dock', 'meet_attend', 'demo_posted', 'demo_presented', 'clinic_helpful', 'help_solved')),
                ref_message_id TEXT,
                ref_user_id TEXT,
                points INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                season_id INTEGER REFERENCES seasons(id),
                week_key DATE
            )
        `);

        db.querySync(`
            CREATE TABLE IF NOT EXISTS streaks (
                user_id TEXT REFERENCES users(id) PRIMARY KEY,
                weekly_current INTEGER DEFAULT 0,
                weekly_best INTEGER DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_week_achieved DATE
            )
        `);

        db.querySync(`
            CREATE TABLE IF NOT EXISTS badges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                label TEXT NOT NULL,
                description TEXT,
                seasonal INTEGER DEFAULT 0
            )
        `);

        return db.querySync(`
            CREATE TABLE IF NOT EXISTS user_badges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT REFERENCES users(id),
                badge_id INTEGER REFERENCES badges(id),
                season_id INTEGER REFERENCES seasons(id),
                awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, badge_id, season_id)
            )
        `);
    },

    async createPoliciesTable(db) {
        await db.querySync(`
            CREATE TABLE IF NOT EXISTS policies (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert default policies
        return await db.querySync(`
            INSERT OR IGNORE INTO policies (key, value) VALUES
                ('gamification.enabled', '"true"'),
                ('season.length_weeks', '"6"'),
                ('weekly_goal.required_actions', '"2"'),
                ('points.per_action', '"1"'),
                ('points.max_per_week', '"3"'),
                ('points.meet_attendance_bonus', '"1"'),
                ('points.demo_presented_bonus', '"1"'),
                ('leaderboard.public', '"false"'),
                ('nudge.quiet_days', '"10"'),
                ('clinic.helpful_required', '"true"'),
                ('dock.time', '"09:00"'),
                ('timezone', '"Europe/London"')
        `);
    },

    async createClinicsTable(db) {
        return db.querySync(`
            CREATE TABLE IF NOT EXISTS clinics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                author_id TEXT NOT NULL REFERENCES users(id),
                message_id TEXT UNIQUE NOT NULL,
                goal TEXT,
                draft TEXT,
                questions TEXT,
                ask TEXT,
                status TEXT DEFAULT 'open' CHECK (status IN ('open', 'solved')),
                helpful_count INTEGER DEFAULT 0,
                solved_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    },

    async createHelpRequestsTable(db) {
        return db.querySync(`
            CREATE TABLE IF NOT EXISTS help_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                author_id TEXT NOT NULL REFERENCES users(id),
                message_id TEXT UNIQUE NOT NULL,
                category TEXT,
                tags TEXT,
                summary TEXT,
                urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high')),
                status TEXT DEFAULT 'open' CHECK (status IN ('open', 'solved')),
                solved_by TEXT REFERENCES users(id),
                solved_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    },

    async createDemosTable(db) {
        return db.querySync(`
            CREATE TABLE IF NOT EXISTS demos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                author_id TEXT NOT NULL REFERENCES users(id),
                message_id TEXT UNIQUE NOT NULL,
                week_key DATE,
                in_queue INTEGER DEFAULT 0,
                priority INTEGER DEFAULT 0,
                showcased_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    },

    async createKudosTable(db) {
        return db.querySync(`
            CREATE TABLE IF NOT EXISTS kudos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user_id TEXT NOT NULL REFERENCES users(id),
                to_user_id TEXT NOT NULL REFERENCES users(id),
                message_id TEXT UNIQUE,
                reason TEXT,
                points INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                season_id INTEGER REFERENCES seasons(id)
            )
        `);
    },

    async createReportsTable(db) {
        return db.querySync(`
            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reporter_id TEXT NOT NULL REFERENCES users(id),
                reported_user_id TEXT REFERENCES users(id),
                message_id TEXT,
                channel_id TEXT NOT NULL,
                reason TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
                reviewed_by TEXT REFERENCES users(id),
                reviewed_at DATETIME,
                action_taken TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    },

    async createConsentsTable(db) {
        return db.querySync(`
            CREATE TABLE IF NOT EXISTS consents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL REFERENCES users(id),
                consent_type TEXT NOT NULL,
                granted INTEGER DEFAULT 0,
                granted_at DATETIME,
                revoked_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, consent_type)
            )
        `);
    },

    async createAnalyticsSnapshotsTable(db) {
        return db.querySync(`
            CREATE TABLE IF NOT EXISTS analytics_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                snapshot_date DATE NOT NULL,
                metric_name TEXT NOT NULL,
                metric_value TEXT NOT NULL,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(snapshot_date, metric_name)
            )
        `);
    },

    async createIndexes(db) {
        const indexes = [
            // Users indexes - Enhanced for common queries
            'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
            'CREATE INDEX IF NOT EXISTS idx_users_last_activity ON users(last_activity_at)',
            'CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at)',
            'CREATE INDEX IF NOT EXISTS idx_users_away_until ON users(away_until)',
            'CREATE INDEX IF NOT EXISTS idx_users_dm_open ON users(dm_open)',
            
            // Compound indexes for common WHERE clauses
            'CREATE INDEX IF NOT EXISTS idx_users_active ON users(deleted_at, last_activity_at) WHERE deleted_at IS NULL',
            'CREATE INDEX IF NOT EXISTS idx_users_away_active ON users(away_until, deleted_at) WHERE deleted_at IS NULL',
            
            // Messages indexes - Enhanced with compound indexes
            'CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id)',
            'CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id)',
            'CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type)',
            
            // Compound indexes for common message queries
            'CREATE INDEX IF NOT EXISTS idx_messages_user_created ON messages(user_id, created_at)',
            'CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel_id, created_at)',
            'CREATE INDEX IF NOT EXISTS idx_messages_type_created ON messages(type, created_at)',
            
            // Meets indexes
            'CREATE INDEX IF NOT EXISTS idx_meets_start_at ON meets(start_at)',
            'CREATE INDEX IF NOT EXISTS idx_meets_status ON meets(status)',
            'CREATE INDEX IF NOT EXISTS idx_meet_rsvps_meet_id ON meet_rsvps(meet_id)',
            'CREATE INDEX IF NOT EXISTS idx_meet_rsvps_user_id ON meet_rsvps(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_meet_attendance_meet_id ON meet_attendance(meet_id)',
            'CREATE INDEX IF NOT EXISTS idx_meet_attendance_user_id ON meet_attendance(user_id)',
            
            // Clinics indexes
            'CREATE INDEX IF NOT EXISTS idx_clinics_author_id ON clinics(author_id)',
            'CREATE INDEX IF NOT EXISTS idx_clinics_message_id ON clinics(message_id)',
            'CREATE INDEX IF NOT EXISTS idx_clinics_status ON clinics(status)',
            'CREATE INDEX IF NOT EXISTS idx_clinics_created_at ON clinics(created_at)',
            
            // Help requests indexes
            'CREATE INDEX IF NOT EXISTS idx_help_requests_author_id ON help_requests(author_id)',
            'CREATE INDEX IF NOT EXISTS idx_help_requests_message_id ON help_requests(message_id)',
            'CREATE INDEX IF NOT EXISTS idx_help_requests_status ON help_requests(status)',
            'CREATE INDEX IF NOT EXISTS idx_help_requests_urgency ON help_requests(urgency)',
            'CREATE INDEX IF NOT EXISTS idx_help_requests_solved_by ON help_requests(solved_by)',
            
            // Demos indexes
            'CREATE INDEX IF NOT EXISTS idx_demos_author_id ON demos(author_id)',
            'CREATE INDEX IF NOT EXISTS idx_demos_message_id ON demos(message_id)',
            'CREATE INDEX IF NOT EXISTS idx_demos_in_queue ON demos(in_queue)',
            'CREATE INDEX IF NOT EXISTS idx_demos_week_key ON demos(week_key)',
            
            // Kudos indexes
            'CREATE INDEX IF NOT EXISTS idx_kudos_from_user_id ON kudos(from_user_id)',
            'CREATE INDEX IF NOT EXISTS idx_kudos_to_user_id ON kudos(to_user_id)',
            'CREATE INDEX IF NOT EXISTS idx_kudos_season_id ON kudos(season_id)',
            'CREATE INDEX IF NOT EXISTS idx_kudos_created_at ON kudos(created_at)',
            
            // Reports indexes
            'CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports(reporter_id)',
            'CREATE INDEX IF NOT EXISTS idx_reports_reported_user_id ON reports(reported_user_id)',
            'CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)',
            'CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at)',
            
            // Consents indexes
            'CREATE INDEX IF NOT EXISTS idx_consents_user_id ON consents(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_consents_consent_type ON consents(consent_type)',
            
            // Analytics snapshots indexes
            'CREATE INDEX IF NOT EXISTS idx_analytics_snapshot_date ON analytics_snapshots(snapshot_date)',
            'CREATE INDEX IF NOT EXISTS idx_analytics_metric_name ON analytics_snapshots(metric_name)',
            
            // Gamification indexes - Enhanced with compound indexes
            'CREATE INDEX IF NOT EXISTS idx_seasons_status ON seasons(status)',
            'CREATE INDEX IF NOT EXISTS idx_seasons_start_date ON seasons(start_date)',
            'CREATE INDEX IF NOT EXISTS idx_seasons_status_dates ON seasons(status, start_date, end_date)',
            
            'CREATE INDEX IF NOT EXISTS idx_scores_user_id ON scores(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_scores_season_id ON scores(season_id)',
            'CREATE INDEX IF NOT EXISTS idx_scores_season_points ON scores(season_id, points DESC)',
            
            'CREATE INDEX IF NOT EXISTS idx_actions_log_user_id ON actions_log(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_actions_log_type ON actions_log(type)',
            'CREATE INDEX IF NOT EXISTS idx_actions_log_season_id ON actions_log(season_id)',
            'CREATE INDEX IF NOT EXISTS idx_actions_log_week_key ON actions_log(week_key)',
            'CREATE INDEX IF NOT EXISTS idx_actions_log_created_at ON actions_log(created_at)',
            
            // Compound indexes for gamification queries
            'CREATE INDEX IF NOT EXISTS idx_actions_log_user_season ON actions_log(user_id, season_id)',
            'CREATE INDEX IF NOT EXISTS idx_actions_log_user_week ON actions_log(user_id, week_key)',
            'CREATE INDEX IF NOT EXISTS idx_actions_log_season_week ON actions_log(season_id, week_key)',
            'CREATE INDEX IF NOT EXISTS idx_actions_log_type_created ON actions_log(type, created_at)',
            
            'CREATE INDEX IF NOT EXISTS idx_streaks_user_id ON streaks(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id ON user_badges(badge_id)',
            'CREATE INDEX IF NOT EXISTS idx_user_badges_season_id ON user_badges(season_id)',
            'CREATE INDEX IF NOT EXISTS idx_user_badges_user_season ON user_badges(user_id, season_id)',
            
            // Performance indexes for leaderboard queries
            'CREATE INDEX IF NOT EXISTS idx_scores_leaderboard ON scores(season_id, points DESC, user_id)',
            'CREATE INDEX IF NOT EXISTS idx_actions_weekly_summary ON actions_log(user_id, week_key, points)'
        ];

        for (const indexSQL of indexes) {
            db.querySync(indexSQL);
        }
    },

    async optimizePragmas(db) {
        // SQLite performance optimizations
        const pragmas = [
            // WAL mode for better concurrency and performance
            'PRAGMA journal_mode = WAL',
            
            // Faster synchronization (safe for most applications)
            'PRAGMA synchronous = NORMAL',
            
            // Larger cache size (32MB instead of default 2MB)
            'PRAGMA cache_size = -32000',
            
            // Enable memory-mapped I/O for better performance
            'PRAGMA mmap_size = 268435456', // 256MB
            
            // Optimize page size for better I/O
            'PRAGMA page_size = 4096',
            
            // Automatic vacuuming for maintenance
            'PRAGMA auto_vacuum = INCREMENTAL',
            
            // Optimize temporary storage
            'PRAGMA temp_store = MEMORY',
            
            // Enable foreign key constraints
            'PRAGMA foreign_keys = ON',
            
            // Optimize query planner
            'PRAGMA optimize = 0x10002',
            
            // Set busy timeout to handle concurrent access
            'PRAGMA busy_timeout = 30000', // 30 seconds
            
            // Analyze tables for better query planning
            'PRAGMA analysis_limit = 1000'
        ];

        for (const pragma of pragmas) {
            try {
                db.querySync(pragma);
            } catch (error) {
                console.warn(`Failed to set pragma: ${pragma}`, error.message);
            }
        }
    },

    async scheduleMaintenanceTasks(db) {
        // These should be run periodically for optimal performance
        const maintenanceTasks = [
            'PRAGMA incremental_vacuum',
            'PRAGMA optimize',
            'ANALYZE'
        ];

        for (const task of maintenanceTasks) {
            try {
                db.querySync(task);
            } catch (error) {
                console.warn(`Failed to run maintenance task: ${task}`, error.message);
            }
        }
    }
};