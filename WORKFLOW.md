# Development Workflow

This document outlines the recommended workflow for developing and releasing this Obsidian plugin.

## Overview

The repository uses two branches:
- **`dev`** - Development branch for ongoing work and frequent backups
- **`master`** - Production branch for official releases only

## Daily Development Workflow

### 1. Start Your Work Session
```bash
# Switch to dev branch (if not already there)
git checkout dev
```

### 2. Make Changes
- Edit your code
- Test locally
- Make as many changes as you want

### 3. Backup Your Work
```bash
# This will:
# - Build your code
# - Run quality checks
# - Commit changes to dev branch
# - Push to GitHub dev branch
npm run backup
```

**Note:** `npm run backup` automatically switches to the `dev` branch if you're on a different branch.

You can run `npm run backup` as often as you like. It's safe and **only pushes to the dev branch**, never to master.

### 4. Continue Working
- Repeat steps 2-3 as many times as needed
- Your work is safely backed up on GitHub in the `dev` branch
- The `master` branch remains clean for production releases

## Release Workflow

When you're ready to publish a new version to the Obsidian community:

### 1. Ensure You're Ready
- Test thoroughly in your local Obsidian vault
- Make sure all changes are backed up with `npm run backup`
- Verify everything works as expected

### 2. Merge Dev into Master
```bash
# Switch to master branch
git checkout master

# Merge or reset from dev (choose one method)

# Method A: Merge (preserves commit history)
git merge dev

# Method B: Reset (overwrites master with dev - cleaner history)
git reset --hard dev
git push origin master --force
```

**Note:** Since you're not actually merging in the traditional Git sense, Method B (reset) is simpler and keeps your history cleaner.

### 3. Create Release
```bash
# Run the release script
npm run release
```

This will:
- Prompt for a new version number
- Update version files
- Build production code
- Create a git tag
- Push to master branch
- Create a GitHub release with assets
- Optionally create a draft release for editing

### 4. Return to Development
```bash
# Switch back to dev branch
git checkout dev

# Sync dev with the new release from master
git merge master
```

## Quick Reference

| Command | Action | Branch |
|---------|--------|--------|
| `npm run backup` | Backup work in progress | Pushes to `dev` |
| `npm run release` | Publish official release | Pushes to `master` |
| `npm run build` | Build only (no commit/push) | Current branch |
| `npm run dev` | Development mode with watch | Current branch |

## Branch Protection

- **`dev` branch**: Your safe playground. Backup here frequently!
- **`master` branch**: Production-ready code only. Updated via `npm run release`.

## Benefits of This Workflow

1. **Safety**: You can backup frequently without affecting production
2. **Confidence**: Test thoroughly on `dev` before releasing
3. **Clean History**: `master` only contains release commits
4. **Flexibility**: Easy to experiment and roll back on `dev`
5. **Professional**: Follows Git best practices for plugin development

## Troubleshooting

### I'm on master and want to switch to dev
```bash
git checkout dev
```

### I accidentally made changes on master
```bash
# Stash your changes
git stash

# Switch to dev
git checkout dev

# Apply your changes
git stash pop
```

### I want to start fresh on dev from master
```bash
git checkout dev
git reset --hard master
```

### I want to see which branch I'm on
```bash
git branch --show-current
```

## Tips

- Stay on the `dev` branch for day-to-day work
- Run `npm run backup` liberally - it's designed for frequent use
- Only use `npm run release` when you're ready to publish to the community
- Always test locally before running `npm run release`

