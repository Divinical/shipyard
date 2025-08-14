// src/utils/TimeUtils.js
import moment from 'moment-timezone';

export class TimeUtils {
    static getServerTimezone() {
        return process.env.SERVER_TIMEZONE || 'Europe/London';
    }

    static getCurrentTime(timezone = null) {
        return moment().tz(timezone || this.getServerTimezone());
    }

    static formatDateTime(date, format = 'YYYY-MM-DD HH:mm', timezone = null) {
        return moment(date).tz(timezone || this.getServerTimezone()).format(format);
    }

    static getWeekStart(date = new Date()) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
        return new Date(d.setDate(diff));
    }

    static getWeekEnd(date = new Date()) {
        const start = this.getWeekStart(date);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return end;
    }

    static getMonthStart(date = new Date()) {
        return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    static getMonthEnd(date = new Date()) {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0);
    }

    static addDays(date, days) {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    static getDaysBetween(date1, date2) {
        const diff = Math.abs(date2 - date1);
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    static isWithinDays(date, days) {
        const now = new Date();
        const target = new Date(date);
        const diff = this.getDaysBetween(now, target);
        return diff <= days;
    }

    static formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    static parseUserTime(timeString, userTimezone) {
        // Try various formats
        const formats = [
            'YYYY-MM-DD HH:mm',
            'DD/MM/YYYY HH:mm',
            'MM/DD/YYYY HH:mm',
            'HH:mm',
            'YYYY-MM-DD'
        ];

        for (const format of formats) {
            const parsed = moment.tz(timeString, format, userTimezone);
            if (parsed.isValid()) {
                return parsed.toDate();
            }
        }

        return null;
    }

    static getNextOccurrence(time, timezone = null) {
        const tz = timezone || this.getServerTimezone();
        const [hours, minutes] = time.split(':').map(Number);
        
        const next = moment().tz(tz);
        next.hours(hours);
        next.minutes(minutes);
        next.seconds(0);
        
        if (next.isBefore(moment())) {
            next.add(1, 'day');
        }
        
        return next.toDate();
    }

    static isBusinessHours(date = new Date(), timezone = null) {
        const m = moment(date).tz(timezone || this.getServerTimezone());
        const hour = m.hour();
        const day = m.day();
        
        // Monday-Friday, 9am-6pm
        return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
    }

    // SQLite-specific date helpers
    static sqliteNow() {
        return "datetime('now')";
    }

    static sqliteDate() {
        return "date('now')";
    }

    static sqliteInterval(amount, unit) {
        // Convert to SQLite datetime modifier format
        const sign = amount >= 0 ? '+' : '';
        return `datetime('now', '${sign}${amount} ${unit}')`;
    }

    static sqliteDateAdd(baseDate, amount, unit) {
        const sign = amount >= 0 ? '+' : '';
        return `datetime(${baseDate}, '${sign}${amount} ${unit}')`;
    }

    static sqliteWeekStart(date = "date('now')") {
        // Get Monday of the week for given date
        return `date(${date}, 'weekday 1', '-6 days')`;
    }

    static sqliteMonthStart(date = "date('now')") {
        return `date(${date}, 'start of month')`;
    }

    static sqliteYearStart(date = "date('now')") {
        return `date(${date}, 'start of year')`;
    }

    static formatForSQLite(date) {
        // Format JavaScript Date for SQLite storage
        if (date instanceof Date) {
            return date.toISOString();
        }
        return date;
    }

    static parseFromSQLite(sqliteDate) {
        // Parse SQLite date string to JavaScript Date
        if (typeof sqliteDate === 'string') {
            return new Date(sqliteDate);
        }
        return sqliteDate;
    }
}