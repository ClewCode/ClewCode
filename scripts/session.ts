#!/usr/bin/env bun
/**
 * Session Bridge
 *
 * Saves & restores session context so Claude Code can pick up
 * where it left off across sessions.
 *
 * Usage:
 *   bun run session save     "กำลัง refactor bridge reconnect logic"
 *   bun run session list     # ดู sessions ล่าสุด
 *   bun run session restore  # โหลด session ล่าสุดกลับมา
 *   bun run session drop     # ลบ current session
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs'
import { join, dirname, basename } from 'path'
import { execSync } from 'child_process'

const ROOT = join(import.meta.dirname, '..')
const SESSIONS_DIR = join(ROOT, '.clew', 'sessions')
const CURRENT_LINK = join(SESSIONS_DIR, 'CURRENT.md')
const MAX_SESSIONS = 20

const cmd = process.argv[2]
const message = process.argv.slice(3).join(' ')

function run(cmd: string): string {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'ignore'] })
  } catch (e: any) {
    return e.stdout || ''
  }
}

function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function sessionId(): string {
  return new Date().toISOString().slice(0, 10) + '-' + Date.now().toString(36)
}

function getModifiedFiles(): string[] {
  try {
    const out = run('git diff --name-only --relative').trim()
    const staged = run('git diff --cached --name-only --relative').trim()
    const files = [...new Set([...out.split('\n'), ...staged.split('\n')])].filter(Boolean)
    return files.filter(f => f.startsWith('src/'))
  } catch {
    return []
  }
}

function getCurrentBranch(): string {
  try {
    return run('git branch --show-current').trim()
  } catch {
    return 'unknown'
  }
}

function getRecentCommits(count = 5): string[] {
  try {
    return run(`git log --oneline -${count} -- .`).trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

// ── Commands ──

if (cmd === 'save') {
  const id = sessionId()
  const branch = getCurrentBranch()
  const modified = getModifiedFiles()
  const commits = getRecentCommits(3)
  const content = message || '(no description)'

  mkdirSync(SESSIONS_DIR, { recursive: true })

  const md = [
    `# Session: ${id}`,
    ``,
    `- **Date**: ${ts()}`,
    `- **Branch**: ${branch}`,
    `- **Description**: ${content}`,
    ``,
  ]

  if (modified.length) {
    md.push(`## Modified Files`, ``)
    for (const f of modified) md.push(`- \`${f}\``)
    md.push(``)
  }

  if (commits.length) {
    md.push(`## Recent Commits`, ``)
    md.push('```')
    for (const c of commits) md.push(c)
    md.push('```')
    md.push(``)
  }

  md.push(`## Notes`, ``)
  md.push(`(add key decisions, pending items, or anything to remember)`)
  md.push(``)

  const filepath = join(SESSIONS_DIR, `${id}.md`)
  writeFileSync(filepath, md.join('\n'), 'utf-8')
  writeFileSync(CURRENT_LINK, `# Current Session\n\n${content}\n\nSee: ${id}.md`, 'utf-8')

  console.log(`✅ Session saved: ${id}`)
  console.log(`   ${filepath}`)
  if (modified.length) console.log(`   ${modified.length} modified file(s)`)

} else if (cmd === 'list') {
  mkdirSync(SESSIONS_DIR, { recursive: true })
  const files = readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.md') && f !== 'CURRENT.md')
    .sort()
    .reverse()
    .slice(0, MAX_SESSIONS)

  if (files.length === 0) {
    console.log('📭 No saved sessions')
    process.exit(0)
  }

  console.log(`📋 Recent sessions (${files.length}):`)
  console.log('')
  for (const f of files) {
    const content = readFileSync(join(SESSIONS_DIR, f), 'utf-8')
    const firstLine = content.split('\n')[0] || f
    const desc = content.match(/\*\*Description\*\*:\s*(.+)/)?.[1] || '(no description)'
    const date = content.match(/\*\*Date\*\*:\s*(.+)/)?.[1] || '?'
    console.log(`  ${firstLine.replace('# ', '')}`)
    console.log(`    ${date} — ${desc}`)
    console.log('')
  }

} else if (cmd === 'restore') {
  if (!existsSync(CURRENT_LINK)) {
    console.log('📭 No current session to restore')
    process.exit(0)
  }

  const content = readFileSync(CURRENT_LINK, 'utf-8')
  const refMatch = content.match(/See:\s+(.+\.md)/)
  if (!refMatch) {
    console.log('📭 No session file referenced')
    process.exit(0)
  }

  const sessionFile = join(SESSIONS_DIR, refMatch[1])
  if (!existsSync(sessionFile)) {
    console.log(`📭 Session file not found: ${sessionFile}`)
    process.exit(0)
  }

  const session = readFileSync(sessionFile, 'utf-8')
  console.log('📋 Restoring session...')
  console.log('')
  console.log(session)

} else if (cmd === 'drop') {
  if (existsSync(CURRENT_LINK)) {
    const content = readFileSync(CURRENT_LINK, 'utf-8')
    const refMatch = content.match(/See:\s+(.+\.md)/)
    if (refMatch) {
      const sessionFile = join(SESSIONS_DIR, refMatch[1])
      if (existsSync(sessionFile)) {
        try { execSync(`rm "${sessionFile}"`) } catch {}
        console.log(`🗑️  Removed: ${refMatch[1]}`)
      }
    }
    try { execSync(`rm "${CURRENT_LINK}"`) } catch {}
    console.log('✅ Session dropped')
  } else {
    console.log('📭 No current session')
  }

} else {
  console.log(`
Usage:
  bun run session save "<description>"     — save current state
  bun run session list                     — list recent sessions
  bun run session restore                  — restore latest session
  bun run session drop                     — drop current session

Examples:
  bun run session save "adding auth middleware"
  bun run session save "fixing bridge reconnect bug"
  bun run session list
  `)
}
