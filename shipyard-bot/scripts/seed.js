// scripts/seed.js
import { config } from 'dotenv';
import { DatabaseConnection } from '../src/database/index.js';
import chalk from 'chalk';

config();

async function seed() {
    const db = new DatabaseConnection();
    
    try {
        console.log(chalk.blue('Connecting to database...'));
        db.connect();
        
        console.log(chalk.blue('Seeding database...'));
        
        // Seed badges if they don't exist
        const badges = [
            { code: 'first_dock', label: 'First Dock', description: 'Posted your first Dock Check' },
            { code: 'first_demo', label: 'First Demo', description: 'Posted your first demo' },
            { code: 'clinic_helper_5', label: 'Clinic Helper', description: 'Gave 5 helpful feedback responses' },
            { code: 'problem_solver_5', label: 'Problem Solver', description: 'Solved 5 help requests' },
            { code: 'streak_4_weeks', label: '4 Week Streak', description: 'Maintained a 4-week activity streak' },
            { code: 'meet_regular_4', label: 'Meet Regular', description: 'Attended 4 weekly meetings' },
            { code: 'season_winner', label: 'Season Winner', description: 'Won a season' },
            { code: 'early_bird', label: 'Early Bird', description: 'One of the first 100 members' },
            { code: 'mentor', label: 'Mentor', description: 'Helped 10+ members' },
            { code: 'shipped', label: 'Shipped', description: 'Launched a project' }
        ];
        
        for (const badge of badges) {
            await db.query(
                `INSERT OR REPLACE INTO badges (code, label, description, seasonal)
                 VALUES (?, ?, ?, ?)`,
                [badge.code, badge.label, badge.description, 0]
            );
        }
        console.log(chalk.green(`✓ Seeded ${badges.length} badges`));
        
        // Seed default policies
        const policies = {
            'gamification.enabled': true,
            'season.length_weeks': 6,
            'weekly_goal.required_actions': 2,
            'points.per_action': 1,
            'points.max_per_week': 3,
            'points.meet_attendance_bonus': 1,
            'points.demo_presented_bonus': 1,
            'leaderboard.public': false,
            'nudge.quiet_days': 10,
            'clinic.helpful_required': 2,
            'dock.time': '09:00',
            'timezone': 'Europe/London',
            'raid.threshold': 8,
            'quarantine.duration': 10,
            'inactive.warning_days': 14,
            'inactive.removal_days': 28
        };
        
        for (const [key, value] of Object.entries(policies)) {
            await db.query(
                `INSERT OR IGNORE INTO policies (key, value)
                 VALUES (?, ?)`,
                [key, JSON.stringify(value)]
            );
        }
        console.log(chalk.green(`✓ Seeded ${Object.keys(policies).length} policies`));
        
        // Create initial season
        const existingSeason = await db.query(
            "SELECT * FROM seasons WHERE status = 'active'"
        );
        
        if (existingSeason.rows.length === 0) {
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 42); // 6 weeks
            
            await db.query(
                `INSERT INTO seasons (start_date, end_date, status)
                 VALUES (?, ?, 'active')`,
                [startDate, endDate]
            );
            console.log(chalk.green('✓ Created initial season'));
        }
        
        console.log(chalk.green('\n✓ Database seeding complete!'));
    } catch (error) {
        console.error(chalk.red('Seeding failed:'), error);
        process.exit(1);
    } finally {
        db.disconnect();
    }
}

seed();