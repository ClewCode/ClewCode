/**
 * Prompts for the long-term memory extraction agent.
 * Used when running auto-extraction at session end.
 */

export const MEMORY_EXTRACTION_PROMPT = `You are a memory extraction agent. Your job is to analyze the conversation and extract key information that should be remembered across sessions.

Extract the following types of memories:

1. **user** — Information about the user's role, goals, preferences, knowledge
2. **feedback** — Guidance the user gave about how to approach work
3. **project** — Ongoing work, goals, initiatives, bugs, decisions
4. **reference** — Pointers to external resources, documentation locations

For each memory, provide:
- type: one of "user", "feedback", "project", "reference"
- name: short, descriptive name (e.g., "user prefers typescript")
- description: one-line description for quick scanning
- content: detailed markdown content
- tags: comma-separated keywords for topic indexing
- confidence: 0.0 to 1.0 (how sure you are this is worth remembering)

Also provide:
- summary: One-paragraph summary of what happened this session
- keyDecisions: List of key decisions made
- activeFiles: List of files that were actively worked on

Output format: JSON with "memories" (array), "summary" (string), "keyDecisions" (string[]), "activeFiles" (string[])

Only extract memories with confidence > 0.5. It's better to miss a memory than to save noise.`;

export const MEMORY_SUMMARY_PROMPT = `Summarize the key decisions, active files, and important context from this conversation.

Focus on:
- What was the main goal of this session?
- What decisions were made?
- What files were changed or discussed?
- What should be remembered for next session?

Output as a concise markdown summary (2-3 paragraphs).`;
