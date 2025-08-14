// src/models/User.js
export class User {
    constructor(db) {
        this.db = db;
    }

    async create(data) {
        await this.db.query(
            `INSERT OR REPLACE INTO users (id, username, joined_at)
             VALUES (?, ?, ?)`,
            [data.id, data.username, data.joined_at || new Date()]
        );
        
        // Get the created/updated record
        const result = await this.db.query(
            'SELECT * FROM users WHERE id = ?',
            [data.id]
        );
        const user = result.rows[0];
        if (user) {
            user.skills = this.db.parseArray(user.skills);
            user.roles = this.db.parseArray(user.roles);
        }
        return user;
    }

    async findById(id) {
        const result = await this.db.query(
            'SELECT * FROM users WHERE id = ?',
            [id]
        );
        const user = result.rows[0];
        if (user) {
            user.skills = this.db.parseArray(user.skills);
            user.roles = this.db.parseArray(user.roles);
        }
        return user;
    }

    async findByUsername(username) {
        const result = await this.db.query(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        const user = result.rows[0];
        if (user) {
            user.skills = this.db.parseArray(user.skills);
            user.roles = this.db.parseArray(user.roles);
        }
        return user;
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
            `UPDATE users SET ${fields.join(', ')}, updated_at = datetime('now')
             WHERE id = ?`,
            values
        );
        
        // Get the updated record
        const result = await this.db.query(
            'SELECT * FROM users WHERE id = ?',
            [id]
        );
        const user = result.rows[0];
        if (user) {
            user.skills = this.db.parseArray(user.skills);
            user.roles = this.db.parseArray(user.roles);
        }
        return user;
    }

    async delete(id) {
        await this.db.query(
            'UPDATE users SET deleted_at = datetime(\'now\') WHERE id = ?',
            [id]
        );
        
        // Get the updated record
        const result = await this.db.query(
            'SELECT * FROM users WHERE id = ?',
            [id]
        );
        const user = result.rows[0];
        if (user) {
            user.skills = this.db.parseArray(user.skills);
            user.roles = this.db.parseArray(user.roles);
        }
        return user;
    }

    async getActiveMembers() {
        const result = await this.db.query(
            `SELECT * FROM users 
             WHERE deleted_at IS NULL 
             AND intro_post_id IS NOT NULL
             AND last_activity_at > datetime('now', '-30 days')`
        );
        const users = result.rows;
        users.forEach(user => {
            user.skills = this.db.parseArray(user.skills);
            user.roles = this.db.parseArray(user.roles);
        });
        return users;
    }

    async getInactiveMembers(days = 14) {
        const result = await this.db.query(
            `SELECT * FROM users 
             WHERE deleted_at IS NULL 
             AND last_activity_at < datetime('now', '-${days} days')
             AND (away_until IS NULL OR away_until < datetime('now'))`
        );
        const users = result.rows;
        users.forEach(user => {
            user.skills = this.db.parseArray(user.skills);
            user.roles = this.db.parseArray(user.roles);
        });
        return users;
    }

    async setAway(id, until) {
        await this.db.query(
            'UPDATE users SET away_until = ? WHERE id = ?',
            [until, id]
        );
        
        // Get the updated record
        const result = await this.db.query(
            'SELECT * FROM users WHERE id = ?',
            [id]
        );
        const user = result.rows[0];
        if (user) {
            user.skills = this.db.parseArray(user.skills);
            user.roles = this.db.parseArray(user.roles);
        }
        return user;
    }

    async clearAway(id) {
        await this.db.query(
            'UPDATE users SET away_until = NULL WHERE id = ?',
            [id]
        );
        
        // Get the updated record
        const result = await this.db.query(
            'SELECT * FROM users WHERE id = ?',
            [id]
        );
        const user = result.rows[0];
        if (user) {
            user.skills = this.db.parseArray(user.skills);
            user.roles = this.db.parseArray(user.roles);
        }
        return user;
    }

    async updateLastActivity(id) {
        await this.db.query(
            'UPDATE users SET last_activity_at = datetime(\'now\') WHERE id = ?',
            [id]
        );
    }

    async checkActiveMemberStatus(id) {
        const user = await this.findById(id);
        if (!user) return { isActive: false };

        const hasIntro = user.intro_post_id != null;

        // Check meet attendance in first 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const meetQuery = await this.db.query(
            `SELECT COUNT(*) FROM meet_attendance ma
             JOIN meets m ON ma.meet_id = m.id
             WHERE ma.user_id = ? AND ma.attended = 1
             AND m.start_at >= ?`,
            [id, thirtyDaysAgo]
        );
        const hasAttendedMeet = parseInt(meetQuery.rows[0].count) > 0;

        // Check activity
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);

        const messageQuery = await this.db.query(
            'SELECT COUNT(*) FROM messages WHERE user_id = ? AND created_at >= ?',
            [id, weekAgo]
        );
        const weeklyMessages = parseInt(messageQuery.rows[0].count);

        const demoQuery = await this.db.query(
            'SELECT COUNT(*) FROM demos WHERE author_id = ? AND created_at >= ?',
            [id, monthAgo]
        );
        const monthlyDemos = parseInt(demoQuery.rows[0].count);

        const hasActivity = weeklyMessages >= 6 || monthlyDemos >= 1;

        return {
            isActive: hasIntro && hasAttendedMeet && hasActivity,
            hasIntro,
            hasAttendedMeet,
            hasActivity,
            weeklyMessages,
            monthlyDemos
        };
    }
}