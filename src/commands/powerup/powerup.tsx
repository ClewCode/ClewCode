import * as React from 'react'
import type { LocalJSXCommandContext } from '../../commands.js'
import { WizardProvider, WizardDialogLayout, WizardNavigationFooter } from '../../components/wizard/index.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { Box, Text } from '../../ink.js'

type Lesson = {
  id: string
  title: string
  description: string
  content: React.ReactNode
}

const lessons: Lesson[] = [
  {
    id: 'mention-files',
    title: 'Talk to your codebase',
    description: 'Use @ to mention files and line references',
    content: (
      <Box flexDirection="column">
        <Text bold>@ Mention Files</Text>
        <Box marginTop={1}>
          <Text>• Type "@" followed by a filename to reference files</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Use line ranges like @file.ts:10-20 for specific sections</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Claude will analyze the referenced content in context</Text>
        </Box>
      </Box>
    )
  },
  {
    id: 'shift-tab-modes',
    title: 'Steer with modes',
    description: 'Use Shift+Tab to switch between Plan, Auto, and Ask modes',
    content: (
      <Box flexDirection="column">
        <Text bold>Shift+Tab Modes</Text>
        <Box marginTop={1}>
          <Text>• Plan Mode: Claude creates a plan before taking action</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Auto Mode: Claude acts automatically within permissions</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Ask Mode: Claude only provides recommendations</Text>
        </Box>
      </Box>
    )
  },
  {
    id: 'rewind',
    title: 'Undo anything',
    description: 'Use /rewind to undo actions or Esc-Esc for quick undo',
    content: (
      <Box flexDirection="column">
        <Text bold>/rewind Command</Text>
        <Box marginTop={1}>
          <Text>• /rewind undoes the last action completely</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Press Esc twice for quick undo of recent changes</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Works with file edits, tool uses, and more</Text>
        </Box>
      </Box>
    )
  },
  {
    id: 'background-tasks',
    title: 'Run in background',
    description: 'Let agents work while you rest',
    content: (
      <Box flexDirection="column">
        <Text bold>Background Tasks</Text>
        <Box marginTop={1}>
          <Text>• Use /tasks to view running background tasks</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Tasks run independently - check back later for results</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Perfect for long-running operations</Text>
        </Box>
      </Box>
    )
  },
  {
    id: 'claude-md',
    title: 'Teach Claude your rules',
    description: 'Use CLAUDE.md and /memory for project context',
    content: (
      <Box flexDirection="column">
        <Text bold>CLAUDE.md</Text>
        <Box marginTop={1}>
          <Text>• Create CLAUDE.md in your project root</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Add project-specific conventions and rules</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Use /memory for persistent memory across sessions</Text>
        </Box>
      </Box>
    )
  },
  {
    id: 'mcp-tools',
    title: 'Extend with tools',
    description: 'Connect external tools via MCP',
    content: (
      <Box flexDirection="column">
        <Text bold>MCP Tools</Text>
        <Box marginTop={1}>
          <Text>• Use /mcp to manage MCP server connections</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Connect databases, APIs, and custom tools</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Tools appear automatically in Claude Code</Text>
        </Box>
      </Box>
    )
  },
  {
    id: 'skills-hooks',
    title: 'Automate your workflow',
    description: 'Use skills and hooks for automation',
    content: (
      <Box flexDirection="column">
        <Text bold>Skills & Hooks</Text>
        <Box marginTop={1}>
          <Text>• Skills are reusable prompt templates</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Hooks run automatically on events (PreToolUse, PostToolUse)</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Create skills in .claude/skills/ directory</Text>
        </Box>
      </Box>
    )
  },
  {
    id: 'subagents',
    title: 'Multiply yourself',
    description: 'Use subagents to parallelize work',
    content: (
      <Box flexDirection="column">
        <Text bold>Subagents</Text>
        <Box marginTop={1}>
          <Text>• Break complex tasks into parallel subagents</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Each subagent works independently</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Use @ mentions to coordinate between agents</Text>
        </Box>
      </Box>
    )
  },
  {
    id: 'teleport',
    title: 'Code from anywhere',
    description: 'Use /teleport and /remote-control',
    content: (
      <Box flexDirection="column">
        <Text bold>/teleport</Text>
        <Box marginTop={1}>
          <Text>• Access your session from any device</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Share sessions with teammates securely</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Resume work from anywhere with the same context</Text>
        </Box>
      </Box>
    )
  },
  {
    id: 'effort',
    title: 'Dial the model',
    description: 'Control model intensity with /effort',
    content: (
      <Box flexDirection="column">
        <Text bold>/effort</Text>
        <Box marginTop={1}>
          <Text>• low: Quick responses for simple tasks</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• medium: Balanced thinking for most tasks</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• high: Deep thinking for complex problems</Text>
        </Box>
        <Box marginTop={1}>
          <Text>• Use "ultrathink" for the deepest reasoning</Text>
        </Box>
      </Box>
    )
  }
]

function PowerupDialog({ onDone }: { onDone: LocalJSXCommandOnDone }) {
  const steps = lessons.map(l => () => (
    <WizardDialogLayout title={l.title} subtitle={l.description}>
      {l.content}
      <WizardNavigationFooter />
    </WizardDialogLayout>
  ))

  return (
    <WizardProvider
      title="Claude Code Power Up"
      steps={steps}
      onComplete={() => onDone(undefined, { display: 'skip' })}
      onCancel={() => onDone(undefined, { display: 'skip' })}
    />
  )
}

export async function call(onDone: LocalJSXCommandOnDone, _context: LocalJSXCommandContext): Promise<React.ReactNode> {
  return <PowerupDialog onDone={onDone} />
}