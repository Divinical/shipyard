# SQLite to PostgreSQL Rollback Instructions

If you need to rollback from SQLite to PostgreSQL, follow these steps:

## Prerequisites
- PostgreSQL server running and accessible
- Database credentials ready
- Backup of existing SQLite data (if needed)

## Step 1: Install PostgreSQL Dependencies

```bash
npm uninstall better-sqlite3
npm install pg
```

## Step 2: Update Database Configuration

Update `.env` file:
```env
# Change from SQLite to PostgreSQL
DATABASE_URL=postgresql://username:password@localhost:5432/shipyard_bot
```

## Step 3: Update Database Connection

In `src/database/index.js`, revert to PostgreSQL connection:

```javascript
// Replace better-sqlite3 imports with pg
import pkg from 'pg';
const { Pool } = pkg;

class Database {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
    }

    async query(text, params) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(text, params);
            return result;
        } finally {
            client.release();
        }
    }

    async close() {
        await this.pool.end();
    }
}
```

## Step 4: Update SQL Schema

Replace SQLite-specific syntax in `src/database/sqlite-schema.js` (rename to `postgres-schema.js`):

### Key Changes:
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
- `TEXT` → `VARCHAR(255)` or `TEXT`
- `DATETIME` → `TIMESTAMP`
- Remove `lastID` references, use `RETURNING id` instead

### Example Table:
```sql
-- SQLite (remove this)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- PostgreSQL (use this)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    discord_id VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Step 5: Update Query Syntax

### Changes needed in command files:

1. **Parameter placeholders**: `?` → `$1, $2, $3...`
2. **INSERT with ID**: Use `RETURNING id` instead of `lastID`
3. **JSON fields**: Use PostgreSQL JSON functions

### Example fixes:
```javascript
// SQLite (remove)
const result = await this.db.query(
    'INSERT INTO users (discord_id) VALUES (?)',
    [userId]
);
const newId = result.lastID;

// PostgreSQL (use this)
const result = await this.db.query(
    'INSERT INTO users (discord_id) VALUES ($1) RETURNING id',
    [userId]
);
const newId = result.rows[0].id;
```

## Step 6: Data Migration (if needed)

If you have existing SQLite data to migrate:

1. Export data from SQLite:
```bash
sqlite3 shipyard.db .dump > backup.sql
```

2. Convert SQLite dump to PostgreSQL format (manual process)
3. Import to PostgreSQL:
```bash
psql -d shipyard_bot -f converted_backup.sql
```

## Step 7: Test and Verify

1. Run health check: `node scripts/health-check.js`
2. Deploy commands: `node scripts/deploy-commands.js`
3. Test bot startup: `npm start`

## Important Notes

- **Backup your SQLite database** before starting rollback
- PostgreSQL requires more complex setup (server installation, user management)
- All existing SQLite data will be lost unless migrated
- Some SQLite-specific features may not work identically in PostgreSQL
- Consider why you're rolling back - SQLite is simpler for most Discord bot use cases

## Files to Modify for Complete Rollback

1. `package.json` - Dependencies
2. `.env` - Database URL
3. `src/database/index.js` - Connection logic
4. `src/database/sqlite-schema.js` - Rename and convert schema
5. All command files with database queries - Update parameter syntax
6. `README.md` - Update setup instructions
7. `.env.template` - Update database configuration template