import * as React from 'react'
import { Select } from '../../components/CustomSelect/select.js'
import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import {
  CHANGELOG_URL,
  fetchAndStoreChangelog,
  getAllReleaseNotes,
  getStoredChangelog,
} from '../../utils/releaseNotes.js'

function formatReleaseNotes(version: string, notes: string[]): string {
  return [`Version ${version}:`, ...notes.map(note => `· ${note}`)].join('\n')
}

function ReleaseNotesPicker({
  notes,
  onDone,
}: {
  notes: Array<[string, string[]]>
  onDone: (message: string) => void
}) {
  const options = notes
    .slice()
    .reverse()
    .map(([version, versionNotes]) => ({
      label: `Version ${version}`,
      description: `${versionNotes.length} notes`,
      value: version,
    }))

  const notesByVersion = new Map(notes)

  return (
    <Box flexDirection="column" gap={1}>
      <Text>Select a release to view</Text>
      <Select
        options={options}
        onChange={version => {
          const versionNotes = notesByVersion.get(version)
          if (!versionNotes) {
            onDone(`See the full changelog at: ${CHANGELOG_URL}`)
            return
          }
          onDone(formatReleaseNotes(version, versionNotes))
        }}
        onCancel={() => onDone('')}
      />
    </Box>
  )
}

export const call: LocalJSXCommandCall = async onDone => {
  let notes: Array<[string, string[]]> = []

  try {
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(reject, 500, new Error('Timeout'))
    })

    await Promise.race([fetchAndStoreChangelog(), timeoutPromise])
    notes = getAllReleaseNotes(await getStoredChangelog())
  } catch {
    notes = getAllReleaseNotes(await getStoredChangelog())
  }

  if (notes.length === 0) {
    onDone(`See the full changelog at: ${CHANGELOG_URL}`)
    return null
  }

  if (notes.length === 1) {
    const [version, versionNotes] = notes[0]!
    onDone(formatReleaseNotes(version, versionNotes))
    return null
  }

  return <ReleaseNotesPicker notes={notes} onDone={message => onDone(message)} />
}
