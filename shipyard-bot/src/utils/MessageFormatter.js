// src/utils/MessageFormatter.js
export class MessageFormatter {
    static formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
        return `${seconds} second${seconds > 1 ? 's' : ''}`;
    }
    
    static formatList(items, conjunction = 'and') {
        if (items.length === 0) return '';
        if (items.length === 1) return items[0];
        if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
        
        const lastItem = items[items.length - 1];
        const otherItems = items.slice(0, -1);
        return `${otherItems.join(', ')}, ${conjunction} ${lastItem}`;
    }
    
    static truncate(text, maxLength = 100) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }
    
    static escapeMarkdown(text) {
        return text.replace(/([*_`~\\])/g, '\\$1');
    }
    
    static formatProgress(current, total, barLength = 10) {
        const progress = Math.min(current / total, 1);
        const filled = Math.floor(progress * barLength);
        const empty = barLength - filled;
        
        return '█'.repeat(filled) + '░'.repeat(empty) + ` ${current}/${total}`;
    }
}

