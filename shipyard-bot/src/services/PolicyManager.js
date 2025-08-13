// src/services/PolicyManager.js
export class PolicyManager {
    constructor(db, logger) {
        this.db = db;
        this.logger = logger;
        this.cache = new Map();
    }

    async getPolicy(key, defaultValue = null) {
        // Check cache first
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        try {
            const result = await this.db.query(
                'SELECT value FROM policies WHERE key = ?',
                [key]
            );

            if (result.rows.length > 0) {
                const value = JSON.parse(result.rows[0].value);
                this.cache.set(key, value);
                return value;
            }

            return defaultValue;
        } catch (error) {
            this.logger.error(`Failed to get policy ${key}:`, error);
            return defaultValue;
        }
    }

    async setPolicy(key, value) {
        try {
            const jsonValue = JSON.stringify(value);
            await this.db.query(
                'INSERT OR REPLACE INTO policies (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
                [key, jsonValue]
            );

            this.cache.set(key, value);
            this.logger.info(`Policy updated: ${key} = ${value}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to set policy ${key}:`, error);
            return false;
        }
    }

    async getAllPolicies() {
        try {
            const result = await this.db.query('SELECT key, value FROM policies');
            const policies = {};
            
            result.rows.forEach(row => {
                policies[row.key] = JSON.parse(row.value);
            });

            return policies;
        } catch (error) {
            this.logger.error('Failed to get all policies:', error);
            return {};
        }
    }

    async loadPolicies() {
        try {
            const policies = await this.getAllPolicies();
            this.cache.clear();
            
            Object.entries(policies).forEach(([key, value]) => {
                this.cache.set(key, value);
            });
            
            this.logger.info(`Loaded ${Object.keys(policies).length} policies into cache`);
        } catch (error) {
            this.logger.error('Failed to load policies:', error);
        }
    }

    clearCache() {
        this.cache.clear();
        this.logger.debug('Policy cache cleared');
    }
}