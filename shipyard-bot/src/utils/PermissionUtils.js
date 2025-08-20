// src/utils/PermissionUtils.js
export class PermissionUtils {
    static hasRole(member, roleName) {
        return member.roles.cache.some(role => role.name === roleName);
    }

    static hasAnyRole(member, roleNames) {
        return member.roles.cache.some(role => roleNames.includes(role.name));
    }

    static isFounder(member) {
        return this.hasRole(member, 'Founder');
    }

    static isModerator(member) {
        return this.hasAnyRole(member, ['Founder', 'Mod']);
    }

    static isBuilder(member) {
        return this.hasAnyRole(member, ['Builder', 'Senior Builder']);
    }

    static isCrew(member) {
        return this.hasRole(member, 'Crew');
    }

    static isMember(member) {
        return this.hasRole(member, 'Member');
    }

    static isAway(member) {
        return this.hasRole(member, 'Away');
    }

    static isQuarantined(member) {
        return this.hasRole(member, 'Quarantine');
    }

    static canManageMeetings(member) {
        return this.isModerator(member);
    }

    static canManageClinic(member) {
        return this.isModerator(member);
    }

    static canViewReports(member) {
        return this.isModerator(member);
    }

    static canManagePolicies(member) {
        return this.isFounder(member);
    }

    static canPromoteUsers(member) {
        return this.isFounder(member);
    }

    static canFreezeUsers(member) {
        return this.isFounder(member);
    }

    static canUnlockServer(member) {
        return this.isFounder(member);
    }

    static getRoleHierarchy(member) {
        const hierarchy = [
            'Founder',
            'Mod',
            'Senior Builder',
            'Builder',
            'Crew',
            'Member',
            'New Member'
        ];

        for (const roleName of hierarchy) {
            if (this.hasRole(member, roleName)) {
                return roleName;
            }
        }

        return null;
    }

    static canExecuteCommand(member, commandName) {
        const commandPermissions = {
            // User-visible commands (available to all members)
            'away': ['Member', 'New Member'],
            'clinic': ['Member', 'New Member'], // feedback request
            'help': ['Member', 'New Member'], // request
            'export': ['Member', 'New Member'],
            'kudos': ['Member', 'New Member'], // thanks
            'start': ['Member', 'New Member'], // introduce
            'meet': ['Member', 'New Member'], // Now available to all users
            
            // Admin commands (Founder only)
            'policy': ['Founder'],
            'freeze': ['Founder'],
            'grant': ['Founder'],
            'promote': ['Founder'],
            'health': ['Founder'],
            'setup-badges': ['Founder'],
            'edit-intro': ['Founder'],
            
            // Moderation commands (keep existing Mod + Founder permissions)
            'active': ['Founder', 'Mod'],
            'monitor': ['Founder', 'Mod'],
            'guardrails': ['Founder', 'Mod'],
            'record': ['Founder', 'Mod'],
            
            // Other commands now restricted to Founder only
            'report': ['Founder'],
            'rank': ['Founder'],
            'badges': ['Founder'],
            'season': ['Founder'],
            'delete': ['Founder']
        };

        const requiredRoles = commandPermissions[commandName];
        if (!requiredRoles) return true; // Command not restricted

        // Check if member has any of the required roles
        return this.hasAnyRole(member, requiredRoles);
    }
}