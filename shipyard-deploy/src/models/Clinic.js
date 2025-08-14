// src/models/Clinic.js
export class Clinic {
    constructor(db) {
        this.db = db;
    }

    async create(data) {
        const insertResult = await this.db.query(
            `INSERT INTO clinics (author_id, message_id, goal, draft, questions, ask, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                data.author_id,
                data.message_id,
                data.goal,
                data.draft,
                this.db.formatArray(data.questions),
                data.ask,
                data.status || 'open'
            ]
        );
        
        // Get the created record using lastID
        const result = await this.db.query(
            'SELECT * FROM clinics WHERE id = ?',
            [insertResult.lastID]
        );
        const record = result.rows[0];
        if (record) {
            record.questions = this.db.parseArray(record.questions);
        }
        return record;
    }

    async findById(id) {
        const result = await this.db.query(
            'SELECT * FROM clinics WHERE id = ?',
            [id]
        );
        const record = result.rows[0];
        if (record) {
            record.questions = this.db.parseArray(record.questions);
        }
        return record;
    }

    async findByMessageId(messageId) {
        const result = await this.db.query(
            'SELECT * FROM clinics WHERE message_id = ?',
            [messageId]
        );
        const record = result.rows[0];
        if (record) {
            record.questions = this.db.parseArray(record.questions);
        }
        return record;
    }

    async markSolved(id) {
        await this.db.query(
            `UPDATE clinics 
             SET status = 'solved', solved_at = datetime('now')
             WHERE id = ?`,
            [id]
        );
        
        // Get the updated record
        const result = await this.db.query(
            'SELECT * FROM clinics WHERE id = ?',
            [id]
        );
        const record = result.rows[0];
        if (record) {
            record.questions = this.db.parseArray(record.questions);
        }
        return record;
    }

    async incrementHelpful(id) {
        await this.db.query(
            `UPDATE clinics 
             SET helpful_count = helpful_count + 1
             WHERE id = ?`,
            [id]
        );
        
        // Get the updated record
        const result = await this.db.query(
            'SELECT * FROM clinics WHERE id = ?',
            [id]
        );
        const record = result.rows[0];
        if (record) {
            record.questions = this.db.parseArray(record.questions);
        }
        return record;
    }

    async getUserHelpfulCount(userId, days = 14) {
        const result = await this.db.query(
            `SELECT COUNT(*) FROM actions_log
             WHERE user_id = ? 
             AND type = 'clinic_helpful'
             AND created_at > datetime('now', '-${days} days')`,
            [userId]
        );
        return parseInt(result.rows[0].count);
    }

    async getOpen() {
        const result = await this.db.query(
            `SELECT c.*, u.username 
             FROM clinics c
             JOIN users u ON c.author_id = u.id
             WHERE c.status = 'open'
             ORDER BY c.created_at DESC`,
        );
        const records = result.rows;
        records.forEach(record => {
            record.questions = this.db.parseArray(record.questions);
        });
        return records;
    }

    async getSolved(limit = 10) {
        const result = await this.db.query(
            `SELECT c.*, u.username 
             FROM clinics c
             JOIN users u ON c.author_id = u.id
             WHERE c.status = 'solved'
             ORDER BY c.solved_at DESC
             LIMIT ?`,
            [limit]
        );
        const records = result.rows;
        records.forEach(record => {
            record.questions = this.db.parseArray(record.questions);
        });
        return records;
    }
}