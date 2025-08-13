// SQLite simplified schema for ShipYard Bot
export const SQLITE_MIGRATIONS = {
    async createUsersTable(db) {
        return db.query(`
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
        return db.query(`
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
        await db.query(`
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

        await db.query(`
            CREATE TABLE IF NOT EXISTS meet_rsvps (
                meet_id INTEGER REFERENCES meets(id),
                user_id TEXT REFERENCES users(id),
                status TEXT CHECK (status IN ('yes', 'no', 'maybe')),
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (meet_id, user_id)
            )
        `);

        return db.query(`
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
        await db.query(`
            CREATE TABLE IF NOT EXISTS seasons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'closed')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS scores (
                user_id TEXT REFERENCES users(id),
                season_id INTEGER REFERENCES seasons(id),
                points INTEGER DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, season_id)
            )
        `);

        await db.query(`
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

        return db.query(`
            CREATE TABLE IF NOT EXISTS streaks (
                user_id TEXT REFERENCES users(id) PRIMARY KEY,
                weekly_current INTEGER DEFAULT 0,
                weekly_best INTEGER DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_week_achieved DATE
            )
        `);
    },

    async createPoliciesTable(db) {
        await db.query(`
            CREATE TABLE IF NOT EXISTS policies (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert default policies
        return db.query(`
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
    }
};