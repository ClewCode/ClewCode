# Commit Commands Plugin

Streamline your git workflow with simple commands for committing and cleaning up branches.

## Overview

The Commit Commands Plugin automates common git operations, reducing context switching and manual command execution. Instead of running multiple git commands, use a single slash command to handle your entire workflow.

## Commands

### `/commit`

Creates a git commit with an automatically generated commit message based on staged and unstaged changes.

**What it does:**
1. Analyzes current git status
2. Reviews both staged and unstaged changes
3. Examines recent commit messages to match your repository's style
4. Drafts an appropriate commit message
5. Stages relevant files
6. Creates the commit

**Usage:**
```bash
/commit
```

**Example workflow:**
```bash
# Make some changes to your code
# Then simply run:
/commit

# Claude will:
# - Review your changes
# - Stage the files
# - Create a commit with an appropriate message
# - Show you the commit status
```

**Features:**
- Automatically drafts commit messages that match your repo's style
- Follows conventional commit practices
- Avoids committing files with secrets (.env, credentials.json)
- Includes Clew Code attribution in commit message

### `/clean_gone`

Cleans up local branches that have been deleted from the remote repository.

**What it does:**
1. Lists all local branches to identify [gone] status
2. Identifies and removes worktrees associated with [gone] branches
3. Deletes all branches marked as [gone]
4. Provides feedback on removed branches

**Usage:**
```bash
/clean_gone
```

**Example workflow:**
```bash
# After PRs are merged and remote branches are deleted
/clean_gone

# Claude will:
# - Find all branches marked as [gone]
# - Remove any associated worktrees
# - Delete the stale local branches
# - Report what was cleaned up
```

**Features:**
- Handles both regular branches and worktree branches
- Safely removes worktrees before deleting branches
- Shows clear feedback about what was removed
- Reports if no cleanup was needed

**When to use:**
- After merging and deleting remote branches
- When your local branch list is cluttered with stale branches
- During regular repository maintenance

## Installation

This plugin is included in the Clew Code repository. The commands are automatically available when using Clew Code.

## Best Practices

### Using `/commit`
- Use when you're ready to create a PR
- Ensure all your changes are complete and tested
- Claude will analyze the full branch history for the PR description
- Review the PR description and edit if needed
- Use when you want to minimize context switching

### Using `/clean_gone`
- Run periodically to keep your branch list clean
- Especially useful after merging multiple PRs
- Safe to run - only removes branches already deleted remotely
- Helps maintain a tidy local repository

## Workflow Integration

### Quick commit workflow:
```bash
# After several PRs are merged
/clean_gone
# Clean workspace ready for next feature
```

## Requirements

- Git must be installed and configured
- Repository must be a git repository with a remote

## Troubleshooting

### `/commit` creates empty commit

**Issue**: No changes to commit

**Solution**:
- Ensure you have unstaged or staged changes
- Run `git status` to verify changes exist

### `/clean_gone` doesn't find branches

**Issue**: No branches marked as [gone]

**Solution**:
- Run `git fetch --prune` to update remote tracking
- Branches must be deleted from the remote to show as [gone]

## Tips

- **Let Claude draft messages**: The commit message analysis learns from your repo's style
- **Regular cleanup**: Run `/clean_gone` weekly to maintain a clean branch list
- **Review before pushing**: Always review the commit message and changes before pushing

## Author

Anthropic (support@anthropic.com)

## Version

1.0.0
