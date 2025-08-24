# Discord Bot Permissions Configuration Guide

## Overview
Your ShipYard bot requires specific Discord permissions to function correctly. The recent errors indicate permission issues, particularly with forum channel operations.

## Required Permissions by Category

### Essential Bot Permissions (Required for all operations)
- **View Channels** - Bot must see channels to operate
- **Send Messages** - Basic message posting capability  
- **Read Message History** - Read existing messages and threads
- **Use External Emojis** - Enhanced UI elements
- **Add Reactions** - Interactive features

### Forum Channel Operations (INTRO, CLINIC channels)
- **Create Public Threads** - Create forum posts (CRITICAL for onboarding)
- **Send Messages in Threads** - Post initial forum content
- **Manage Threads** - Archive, delete, or modify threads
- **Use Application Commands** - Slash command functionality

### Admin Operations (reset-intro command)
- **Manage Threads** - Delete user introduction threads
- **Manage Messages** - Edit or delete forum posts

## Current Permission Issues

### Error 1: "Missing Access" (Code 50001)
- **Location**: INTRO forum channel thread creation
- **Cause**: Bot lacks "Create Public Threads" permission in INTRO channel
- **Impact**: Users cannot complete onboarding process

### Error 2: "Unknown Channel" (Code 10003)  
- **Location**: reset-intro command thread deletion
- **Cause**: Thread already deleted or bot cannot access it
- **Impact**: Warning only - command continues to work

## Step-by-Step Configuration

### 1. Server-Level Permissions
1. Go to **Server Settings** → **Roles**
2. Find your bot's role in the list
3. Click on the bot role to edit permissions
4. Enable these permissions:
   - ✅ View Channels
   - ✅ Send Messages
   - ✅ Create Public Threads
   - ✅ Send Messages in Threads
   - ✅ Manage Threads
   - ✅ Read Message History
   - ✅ Use External Emojis
   - ✅ Add Reactions
   - ✅ Use Application Commands

### 2. Forum Channel Specific Permissions

#### For INTRO Channel (Critical):
1. Right-click the **INTRO** channel → **Edit Channel**
2. Go to **Permissions** tab
3. Click **Add Role** → Select your bot's role
4. Enable these permissions:
   - ✅ View Channel
   - ✅ Send Messages
   - ✅ Create Public Threads ⚠️ **MOST IMPORTANT**
   - ✅ Send Messages in Threads
   - ✅ Manage Threads
   - ✅ Read Message History

#### For CLINIC Channel:
Repeat the same process as INTRO channel.

### 3. Role Hierarchy
1. Go to **Server Settings** → **Roles**
2. Drag your bot's role **above** any roles that might restrict permissions
3. Ensure bot role is positioned appropriately in hierarchy

### 4. Verification Steps

#### Test Forum Creation:
1. In INTRO channel, try manually creating a post to ensure the channel allows it
2. Check if bot can see the channel by using a simple command
3. Run the new `/check-permissions` command for automated diagnostics

#### Environment Variables:
Verify these are set correctly in your `.env` file:
```
INTRO_CHANNEL_ID=your_actual_intro_channel_id
CLINIC_CHANNEL_ID=your_actual_clinic_channel_id
```

## Troubleshooting

### If forum posts still fail:
1. **Double-check channel type**: INTRO_CHANNEL_ID must point to a Forum Channel, not a regular text channel
2. **Bot role position**: Ensure bot role is higher than restrictive roles
3. **Channel-specific overwrites**: Check if channel has specific permission denials for the bot
4. **Guild-wide restrictions**: Some servers have restrictions that override role permissions

### If reset-intro warnings persist:
- These are non-critical warnings - the command will continue working
- Warnings occur when threads are already deleted or inaccessible
- No action needed unless the reset functionality stops working entirely

## New Diagnostic Tools

Your bot now includes a permission diagnostic command:

### `/check-permissions` Command
- **Usage**: `/check-permissions detailed:true`
- **Purpose**: Automatically check all bot permissions across all configured channels
- **Access**: Founder only
- **Features**:
  - Identifies missing permissions
  - Tests channel accessibility
  - Provides specific recommendations
  - Shows detailed breakdown of each channel

### Expected Output:
```
✅ No permission issues detected!
or
⚠️ Found X permission issues

## Channel Status:
✅ INTRO (Forum): introduction
✅ CLINIC (Forum): clinic-help
❌ HELP: Not found

## Recommendations:
1. Grant forum permissions: Create Public Threads, Manage Threads
2. Configure HELP_CHANNEL_ID in environment variables
```

## Prevention

1. **Regular Checks**: Run `/check-permissions` monthly
2. **Monitor Logs**: Watch for permission-related errors
3. **Test After Changes**: Verify functionality after server role changes
4. **Documentation**: Keep this guide updated with any server-specific requirements

## Summary

The critical issue is the bot lacking **"Create Public Threads"** permission in the INTRO forum channel. This prevents users from completing onboarding and causes the "Missing Access" error. Follow the forum channel configuration steps above to resolve this immediately.