export const DESCRIPTION = 'Manage GitHub pull requests — create, list, view, review, merge, and check CI status.';

export function generatePrompt(): string {
  return `## PR Tool

Manage the full lifecycle of GitHub pull requests.

### Actions:
- **create** — Create a PR from the current branch (uses \`gh pr create --fill\`)
- **list** — List open PRs (title, number, branch, author, review status)
- **view** — Show detailed PR info: title, state, branch, changes, reviews, description
- **review** — Fetch diff for AI code review (shows diff + PR metadata)
- **merge** — Merge a PR (squash merge)
- **status** — Show CI checks status for the current branch's PR

### Parameters:
- \`action\` (required): One of create, list, view, review, merge, status
- \`pr_number\` (optional): PR number. Required for: view, review, merge. Ignored for: create, list, status.
- \`branch\` (optional): Branch name. Only used with status action.

### Notes:
- Uses the \`gh\` CLI tool installed on the machine
- Requires GitHub authentication (\`gh auth status\`)
- For \`review\`: returns the full diff for AI analysis
- For \`merge\`: uses squash merge strategy`;
}
