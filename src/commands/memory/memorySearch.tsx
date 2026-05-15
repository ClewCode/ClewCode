import * as React from 'react'
import type { CommandResultDisplay } from '../../commands.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { searchMemories, type MemorySearchResult } from '../../memdir/semanticSearch.js'

/**
 * Interactive memory search component.
 * Shows results with relevance scores and previews.
 */
function MemorySearchCommand({
  query,
  onDone,
}: {
  query?: string
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void
}): React.ReactNode {
  const [results, setResults] = React.useState<MemorySearchResult[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!query) return

    setLoading(true)
    setError(null)

    searchMemories(query, 10, 0.5)
      .then(results => {
        setResults(results)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || 'Search failed')
        setLoading(false)
      })
  }, [query])

  if (loading) {
    return (
      <Dialog title="Memory Search" onCancel={() => onDone('Cancelled')}>
        <Box flexDirection="column">
          <Text>Searching memories for "{query}"...</Text>
          <Text dimColor>Loading embedding model (first time may take a moment)</Text>
        </Box>
      </Dialog>
    )
  }

  if (error) {
    return (
      <Dialog title="Memory Search" onCancel={() => onDone('Cancelled')}>
        <Box flexDirection="column">
          <Text>Error: {error}</Text>
          <Text dimColor>Try again or check debug logs</Text>
        </Box>
      </Dialog>
    )
  }

  if (results.length === 0) {
    return (
      <Dialog title="Memory Search" onCancel={() => onDone('No results found')}>
        <Box flexDirection="column">
          <Text>No memories found for "{query}"</Text>
          <Text dimColor>Try different keywords or add more memories</Text>
        </Box>
      </Dialog>
    )
  }

  return (
    <Dialog title="Memory Search" onCancel={() => onDone('Search complete')}>
      <Box flexDirection="column">
        <Text bold>Found {results.length} memories for "{query}":</Text>
        <Box flexDirection="column" marginTop={1}>
          {results.map((result, i) => (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Text bold>
                {i + 1}. {result.file}
              </Text>
              <Text dimColor>
                Score: {(result.score * 100).toFixed(0)}% | Type: {result.type || 'unknown'}
              </Text>
              {result.description && (
                <Text dimColor>Description: {result.description}</Text>
              )}
              <Text>
                {result.content.slice(0, 150)}
                {result.content.length > 150 ? '...' : ''}
              </Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            Tip: Use /memory to edit or /memory write to add new memories
          </Text>
        </Box>
      </Box>
    </Dialog>
  )
}

/**
 * Command handler for /memory-search
 * Usage: /memory-search "your query here"
 */
export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const query = args?.trim()
  if (!query) {
    onDone('Usage: /memory-search "your query here"', { display: 'system' })
    return
  }

  return <MemorySearchCommand query={query} onDone={onDone} />
}
