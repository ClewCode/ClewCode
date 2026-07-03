export function getDescription(): string {
  return 'Manage project-specific rules that are auto-observed from user behavior. Rules are stored in .clew/rules.json and injected into the system prompt.';
}

export function getPrompt(): string {
  return `Use this tool to save, list, or remove project-specific behavioral rules.

## When to Use This Tool

**Save a rule** when you observe a consistent user preference or behavior pattern:
- The user repeatedly corrects the same type of mistake
- The user has a clear preference for how things should be done in this project
- The user explicitly asks you to remember a project-specific convention
- The user consistently uses or avoids certain patterns, tools, or approaches

Rules should be:
- SHORT (one sentence, under 120 characters)
- Specific and actionable
- Project-scoped (not personal preferences)
- Observable from user behavior (not assumptions)

Good examples:
- "Always use bun instead of npm for package management"
- "Prefer React Server Components over client components"
- "Tests use Vitest, never Jest"
- "Code style: single quotes, no semicolons"

Bad examples (too vague, too long, or not actionable):
- "Write good code"
- "Follow best practices"
- "The user seems to prefer functional programming patterns and immutable data structures in their React components"

**List rules** to see what has been saved.

**Remove a rule** when the user indicates a rule is no longer relevant or was a mistake.

## Guidelines
- Rules are project-specific, stored in .clew/rules.json at the project root
- Each rule is a short, independent guideline
- Do not group multiple guidelines into one rule
- Use 1-based index for removal (the numbers shown in list output)`;
}
