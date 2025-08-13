// src/utils/ValidationUtils.js
export class ValidationUtils {
    static isValidTimezone(timezone) {
        try {
            Intl.DateTimeFormat(undefined, { timeZone: timezone });
            return true;
        } catch {
            return false;
        }
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
    
    static sanitizeInput(input) {
        return input
            .trim()
            .replace(/[<>]/g, '') // Remove potential HTML
            .substring(0, 2000); // Discord message limit
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
}