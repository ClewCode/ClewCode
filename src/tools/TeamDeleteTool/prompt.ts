export function getPrompt(): string {
  return `
# TeamDelete

Remove team and task directories when the swarm work is complete.

This operation:
- Removes the team directory (\`~/.clew/teams/{team-name}/\`)
- Removes the task directory (\`~/.clew/tasks/{team-name}/\`)
- Clears team context from the current session

**IMPORTANT**: TeamDelete will fail if the team still has active members. Use RequestShutdown to gracefully ask each teammate to shut down first. Once all teammates have shut down, call TeamDelete.

Use this when all teammates have finished their work and you want to clean up the team resources. The team name is automatically determined from the current session's team context.
`.trim();
}
