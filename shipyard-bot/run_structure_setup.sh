#\!/bin/bash

# ShipYard Bot - Project Structure Setup Script
# Run this script to create the complete folder structure

echo "Creating ShipYard Bot folder structure..."

# Create source directories
mkdir -p src/commands/onboarding
mkdir -p src/commands/member
mkdir -p src/commands/moderation
mkdir -p src/commands/gamification
mkdir -p src/commands/admin
mkdir -p src/database
mkdir -p src/events
mkdir -p src/handlers
mkdir -p src/services
mkdir -p src/utils
mkdir -p src/models
mkdir -p scripts
mkdir -p logs

# Create command file placeholders
touch src/commands/BaseCommand.js

# Onboarding commands
touch src/commands/onboarding/start.js

# Member commands
touch src/commands/member/away.js
touch src/commands/member/clinic.js
touch src/commands/member/help.js
touch src/commands/member/kudos.js
touch src/commands/member/export.js
touch src/commands/member/delete.js

# Moderation commands
touch src/commands/moderation/active.js
touch src/commands/moderation/meet.js
touch src/commands/moderation/monitor.js
touch src/commands/moderation/report.js
touch src/commands/moderation/guardrails.js
touch src/commands/moderation/record.js

# Gamification commands
touch src/commands/gamification/rank.js
touch src/commands/gamification/badges.js
touch src/commands/gamification/season.js

# Admin commands
touch src/commands/admin/policy.js
touch src/commands/admin/freeze.js
touch src/commands/admin/grant.js
touch src/commands/admin/promote.js
touch src/commands/admin/health.js

# Database files
touch src/database/index.js
touch src/database/migrations.js
touch src/database/queries.js

# Event handlers
touch src/events/ready.js
touch src/events/memberJoin.js
touch src/events/memberLeave.js
touch src/events/messageCreate.js
touch src/events/interactionCreate.js
touch src/events/reactionAdd.js

# Handlers
touch src/handlers/CommandHandler.js
touch src/handlers/EventHandler.js
touch src/handlers/InteractionHandler.js

# Services
touch src/services/GamificationService.js
touch src/services/ModerationService.js
touch src/services/OnboardingService.js
touch src/services/MeetService.js
touch src/services/AnalyticsService.js

# Utils
touch src/utils/Logger.js
touch src/utils/MessageFormatter.js
touch src/utils/TimeUtils.js
touch src/utils/ValidationUtils.js
touch src/utils/PermissionUtils.js

# Models
touch src/models/User.js
touch src/models/Meet.js
touch src/models/Clinic.js
touch src/models/HelpRequest.js
touch src/models/Demo.js

# Scripts
touch scripts/deploy-commands.js
touch scripts/migrate.js
touch scripts/seed.js
touch scripts/backup.js

# Root files
touch .env.template
touch .gitignore
touch README.md
touch LICENSE

echo "✅ Folder structure created successfully\!"
