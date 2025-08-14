// src/utils/ValidationUtils.js
import moment from 'moment-timezone';

export class ValidationUtils {
    static isValidTimezone(timezone) {
        return moment.tz.names().includes(timezone);
    }

    static isValidURL(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    static isValidDiscordId(id) {
        return /^\d{17,19}$/.test(id);
    }

    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    static isValidUsername(username) {
        // Discord username rules
        return username.length >= 2 && username.length <= 32;
    }

    static sanitizeInput(input) {
        return input
            .trim()
            .replace(/[<>]/g, '') // Remove potential HTML
            .substring(0, 2000); // Discord message limit
    }

    static sanitizeMarkdown(text) {
        // Escape Discord markdown characters
        return text.replace(/([*_`~\\|])/g, '\\$1');
    }

    static validateSkills(skills) {
        const validSkills = [
            'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust',
            'React', 'Vue', 'Angular', 'Node.js', 'Express', 'Django', 'Flask',
            'HTML', 'CSS', 'SASS', 'Tailwind', 'Bootstrap',
            'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Firebase',
            'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes',
            'UI/UX', 'Design', 'Marketing', 'Product', 'Data Science',
            'Machine Learning', 'AI', 'Blockchain', 'Mobile', 'iOS', 'Android',
            'DevOps', 'Security', 'Testing', 'QA'
        ];

        return skills.filter(skill => 
            validSkills.some(valid => 
                valid.toLowerCase() === skill.toLowerCase()
            )
        );
    }

    static validateMeetingTime(dateTime) {
        const meetTime = moment(dateTime);
        
        // Must be in the future
        if (meetTime.isBefore(moment())) {
            return { valid: false, error: 'Meeting time must be in the future' };
        }

        // Not more than 3 months out
        if (meetTime.isAfter(moment().add(3, 'months'))) {
            return { valid: false, error: 'Meeting cannot be scheduled more than 3 months in advance' };
        }

        return { valid: true };
    }

    static validateDuration(minutes) {
        return minutes >= 15 && minutes <= 180;
    }

    static validateAwayDuration(days) {
        return days >= 1 && days <= 365;
    }

    static validateReportReason(reason) {
        const minLength = 10;
        const maxLength = 1000;
        
        if (reason.length < minLength) {
            return { valid: false, error: 'Reason must be at least 10 characters' };
        }
        
        if (reason.length > maxLength) {
            return { valid: false, error: 'Reason cannot exceed 1000 characters' };
        }

        return { valid: true };
    }

    static parseDateTime(input, timezone = 'Europe/London') {
        // Try various date formats
        const formats = [
            'YYYY-MM-DD HH:mm',
            'DD/MM/YYYY HH:mm',
            'MM/DD/YYYY HH:mm',
            'YYYY-MM-DD',
            'DD/MM/YYYY',
            'MM/DD/YYYY'
        ];

        for (const format of formats) {
            const date = moment.tz(input, format, timezone);
            if (date.isValid()) {
                return date.toDate();
            }
        }

        return null;
    }

    static isSpam(content) {
        // Basic spam detection
        const spamPatterns = [
            /discord\.(gg|com\/invite)/gi,  // Discord invites
            /bit\.ly|tinyurl|short\.link/gi, // URL shorteners
            /\b(viagra|casino|lottery|winner)\b/gi, // Common spam words
            /(.)\1{10,}/g, // Repeated characters
            /[A-Z\s]{20,}/g // Excessive caps
        ];

        return spamPatterns.some(pattern => pattern.test(content));
    }

    static extractMentions(content) {
        const userMentions = content.match(/<@!?\d{17,19}>/g) || [];
        const roleMentions = content.match(/<@&\d{17,19}>/g) || [];
        const channelMentions = content.match(/<#\d{17,19}>/g) || [];

        return {
            users: userMentions.map(m => m.replace(/[<@!>]/g, '')),
            roles: roleMentions.map(m => m.replace(/[<@&>]/g, '')),
            channels: channelMentions.map(m => m.replace(/[<#>]/g, ''))
        };
    }
}