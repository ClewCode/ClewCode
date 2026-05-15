export const SESSION_SEARCH_TOOL_NAME = 'SessionSearch'

export function getDescription(): string {
  return `Search past session transcripts using full-text search (FTS5).

  Use this tool when you need to recall information from previous conversations:
  - "What did we discuss about X?"
  - "How did we fix Y last time?"
  - "What was the error message about Z?"

  Works across all sessions in the current project directory. Results are ranked
  by relevance (BM25) and include the session ID, message role, and content excerpt.

  This is complementary to the memory system — memory stores curated facts, while
  session search finds raw transcript content.
`
}
