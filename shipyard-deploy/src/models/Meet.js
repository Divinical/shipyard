// src/models/Meet.js
export class Meet {
    constructor(db) {
        this.db = db;
    }

    async create(data) {
        const insertResult = await this.db.query(
            `INSERT INTO meets (title, start_at, duration_mins, status)
             VALUES (?, ?, ?, ?)`,
            [data.title, data.start_at, data.duration_mins || 60, data.status || 'scheduled']
        );
        
        // Get the created record using lastID
        const result = await this.db.query(
            'SELECT * FROM meets WHERE id = ?',
            [insertResult.lastID]
        );
        return result.rows[0];
    }

    async findById(id) {
        const result = await this.db.query(
            'SELECT * FROM meets WHERE id = ?',
            [id]
        );
        return result.rows[0];
    }

    async update(id, data) {
        const fields = [];
        const values = [];
        let index = 1;

        for (const [key, value] of Object.entries(data)) {
            fields.push(`${key} = ?`);
            values.push(value);
            index++;
        }

        values.push(id);

        await this.db.query(
            `UPDATE meets SET ${fields.join(', ')}
             WHERE id = ?`,
            values
        );
        
        // Get the updated record
        const result = await this.db.query(
            'SELECT * FROM meets WHERE id = ?',
            [id]
        );
        return result.rows[0];
    }

    async getUpcoming(limit = 5) {
        const result = await this.db.query(
            `SELECT * FROM meets 
             WHERE start_at > datetime('now') AND status = 'scheduled'
             ORDER BY start_at
             LIMIT ?`,
            [limit]
        );
        return result.rows;
    }

    async close(id) {
        await this.db.query(
            `UPDATE meets SET status = 'closed' 
             WHERE id = ?`,
            [id]
        );
        
        // Get the updated record
        const result = await this.db.query(
            'SELECT * FROM meets WHERE id = ?',
            [id]
        );
        return result.rows[0];
    }

    async addRSVP(meetId, userId, status) {
        await this.db.query(
            `INSERT OR REPLACE INTO meet_rsvps (meet_id, user_id, status, updated_at)
             VALUES (?, ?, ?, ?)`,
            [meetId, userId, status, new Date()]
        );
        
        // Get the created/updated record
        const result = await this.db.query(
            'SELECT * FROM meet_rsvps WHERE meet_id = ? AND user_id = ?',
            [meetId, userId]
        );
        return result.rows[0];
    }

    async getRSVPs(meetId) {
        const result = await this.db.query(
            `SELECT r.*, u.username 
             FROM meet_rsvps r
             JOIN users u ON r.user_id = u.id
             WHERE r.meet_id = ?`,
            [meetId]
        );
        return result.rows;
    }

    async recordAttendance(meetId, attendees) {
        const results = [];
        for (const userId of attendees) {
            await this.db.query(
                `INSERT OR REPLACE INTO meet_attendance (meet_id, user_id, attended)
                 VALUES (?, ?, 1)`,
                [meetId, userId]
            );
            
            // Get the created/updated record
            const result = await this.db.query(
                'SELECT * FROM meet_attendance WHERE meet_id = ? AND user_id = ?',
                [meetId, userId]
            );
            results.push(result.rows[0]);
        }
        return results;
    }

    async getAttendance(meetId) {
        const result = await this.db.query(
            `SELECT a.*, u.username 
             FROM meet_attendance a
             JOIN users u ON a.user_id = u.id
             WHERE a.meet_id = ?`,
            [meetId]
        );
        return result.rows;
    }

    async getUserAttendanceCount(userId, days = 30) {
        const result = await this.db.query(
            `SELECT COUNT(*) FROM meet_attendance ma
             JOIN meets m ON ma.meet_id = m.id
             WHERE ma.user_id = ? 
             AND ma.attended = 1
             AND m.start_at > datetime('now', '-${days} days')`,
            [userId]
        );
        return parseInt(result.rows[0].count);
    }
}