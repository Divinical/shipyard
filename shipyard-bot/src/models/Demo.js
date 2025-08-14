// src/models/Demo.js
export class Demo {
    constructor(db) {
        this.db = db;
    }

    async create(data) {
        const weekKey = this.getWeekKey();
        const insertResult = await this.db.query(
            `INSERT INTO demos (author_id, message_id, week_key, in_queue)
             VALUES (?, ?, ?, ?)`,
            [data.author_id, data.message_id, weekKey, data.in_queue || 0]
        );
        
        // Get the created record using lastID
        const result = await this.db.query(
            'SELECT * FROM demos WHERE id = ?',
            [insertResult.lastID]
        );
        return result.rows[0];
    }

    async findById(id) {
        const result = await this.db.query(
            'SELECT * FROM demos WHERE id = ?',
            [id]
        );
        return result.rows[0];
    }

    async addToQueue(id) {
        await this.db.query(
            'UPDATE demos SET in_queue = 1 WHERE id = ?',
            [id]
        );
        
        // Get the updated record
        const result = await this.db.query(
            'SELECT * FROM demos WHERE id = ?',
            [id]
        );
        return result.rows[0];
    }

    async removeFromQueue(id) {
        await this.db.query(
            'UPDATE demos SET in_queue = 0 WHERE id = ?',
            [id]
        );
        
        // Get the updated record
        const result = await this.db.query(
            'SELECT * FROM demos WHERE id = ?',
            [id]
        );
        return result.rows[0];
    }

    async markShowcased(id) {
        await this.db.query(
            'UPDATE demos SET showcased_at = datetime(\'now\') WHERE id = ?',
            [id]
        );
        
        // Get the updated record
        const result = await this.db.query(
            'SELECT * FROM demos WHERE id = ?',
            [id]
        );
        return result.rows[0];
    }

    async getQueue() {
        const result = await this.db.query(
            `SELECT d.*, u.username 
             FROM demos d
             JOIN users u ON d.author_id = u.id
             WHERE d.in_queue = 1
             ORDER BY d.priority DESC, d.created_at ASC`
        );
        return result.rows;
    }

    async updatePriority(id, priority) {
        await this.db.query(
            'UPDATE demos SET priority = ? WHERE id = ?',
            [priority, id]
        );
        
        // Get the updated record
        const result = await this.db.query(
            'SELECT * FROM demos WHERE id = ?',
            [id]
        );
        return result.rows[0];
    }

    async getUserDemoCount(userId, days = 30) {
        const result = await this.db.query(
            `SELECT COUNT(*) FROM demos 
             WHERE author_id = ? 
             AND created_at > datetime('now', '-${days} days')`,
            [userId]
        );
        return parseInt(result.rows[0].count);
    }

    async getLastUserDemo(userId) {
        const result = await this.db.query(
            `SELECT * FROM demos 
             WHERE author_id = ? 
             AND showcased_at IS NOT NULL
             ORDER BY showcased_at DESC
             LIMIT 1`,
            [userId]
        );
        return result.rows[0];
    }

    getWeekKey() {
        const now = new Date();
        const monday = new Date(now);
        monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
        monday.setHours(0, 0, 0, 0);
        return monday;
    }
}