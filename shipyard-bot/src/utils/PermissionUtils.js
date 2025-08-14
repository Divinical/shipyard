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
            // Admin commands
            'policy': ['Founder'],
            'freeze': ['Founder'],
            'grant': ['Founder'],
            'promote': ['Founder'],
            'health': ['Founder'],
            
            // Moderation commands
            'active': ['Founder', 'Mod'],
            'meet': ['Founder', 'Mod'],
            'monitor': ['Founder', 'Mod'],
            'guardrails': ['Founder', 'Mod'],
            'record': ['Founder', 'Mod'],
            'report': ['Member'], // Anyone can report, but review needs mod
            
            // Member commands - any member can use
            'start': ['Member', 'New Member'],
            'away': ['Member'],
            'clinic': ['Member'],
            'help': ['Member'],
            'kudos': ['Member'],
            'rank': ['Member'],
            'badges': ['Member'],
            'season': ['Member'],
            'export': ['Member'],
            'delete': ['Member']
        };

        const requiredRoles = commandPermissions[commandName];
        if (!requiredRoles) return true; // Command not restricted

        // Check if member has any of the required roles
        return this.hasAnyRole(member, requiredRoles);
    }
}