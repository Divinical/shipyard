// src/models/HelpRequest.js
export class HelpRequest {
    constructor(db) {
        this.db = db;
    }

    async create(data) {
        const insertResult = await this.db.query(
            `INSERT INTO help_requests (author_id, message_id, category, tags, summary, urgency, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                data.author_id,
                data.message_id,
                data.category,
                this.db.formatArray(data.tags || []),
                data.summary,
                data.urgency || 'normal',
                data.status || 'open'
            ]
        );
        
        // Get the created record using lastID
        const result = await this.db.query(
            'SELECT * FROM help_requests WHERE id = ?',
            [insertResult.lastID]
        );
        const record = result.rows[0];
        if (record) {
            record.tags = this.db.parseArray(record.tags);
        }
        return record;
    }

    async findById(id) {
        const result = await this.db.query(
            'SELECT * FROM help_requests WHERE id = ?',
            [id]
        );
        const record = result.rows[0];
        if (record) {
            record.tags = this.db.parseArray(record.tags);
        }
        return record;
    }

    async markSolved(id, solvedBy) {
        await this.db.query(
            `UPDATE help_requests 
             SET status = 'solved', solved_at = datetime('now'), solved_by = ?
             WHERE id = ?`,
            [solvedBy, id]
        );
        
        // Get the updated record
        const result = await this.db.query(
            'SELECT * FROM help_requests WHERE id = ?',
            [id]
        );
        return result.rows[0];
    }

    async getOpen() {
        const result = await this.db.query(
            `SELECT h.*, u.username 
             FROM help_requests h
             JOIN users u ON h.author_id = u.id
             WHERE h.status = 'open'
             ORDER BY 
                CASE h.urgency 
                    WHEN 'high' THEN 1
                    WHEN 'normal' THEN 2
                    WHEN 'low' THEN 3
                END,
                h.created_at DESC`
        );
        const records = result.rows;
        records.forEach(record => {
            record.tags = this.db.parseArray(record.tags);
        });
        return records;
    }

    async getSolvedByUser(userId, limit = 10) {
        const result = await this.db.query(
            `SELECT * FROM help_requests 
             WHERE solved_by = ?
             ORDER BY solved_at DESC
             LIMIT ?`,
            [userId, limit]
        );
        const records = result.rows;
        records.forEach(record => {
            record.tags = this.db.parseArray(record.tags);
        });
        return records;
    }

    async getUserSolvedCount(userId) {
        const result = await this.db.query(
            'SELECT COUNT(*) FROM help_requests WHERE solved_by = ?',
            [userId]
        );
        return parseInt(result.rows[0].count);
    }
}