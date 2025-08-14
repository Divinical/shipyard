// src/services/PolicyManager.js
export class PolicyManager {
    constructor(db) {
        this.db = db;
        this.policies = new Map();
    }

    async loadPolicies() {
        const result = await this.db.query('SELECT key, value FROM policies');
        for (const row of result.rows) {
            this.policies.set(row.key, row.value);
        }
    }

    get(key, defaultValue = null) {
        return this.policies.get(key) || defaultValue;
    }

    async set(key, value) {
        await this.db.query(
            'INSERT OR REPLACE INTO policies (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))',
            [key, JSON.stringify(value)]
        );
        this.policies.set(key, value);
    }

    getAll() {
        return Object.fromEntries(this.policies);
    }

    async delete(key) {
        await this.db.query('DELETE FROM policies WHERE key = ?', [key]);
        this.policies.delete(key);
    }

    has(key) {
        return this.policies.has(key);
    }
}