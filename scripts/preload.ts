#!/usr/bin/env bun
/**
 * Context Preloader
 *
 * Prepares module context before Claude Code starts editing.
 * Usage: bun run scripts/preload.ts <module-name>
 *        bun run scripts/preload.ts src/bridge
 *        bun run scripts/preload.ts src/services/ai
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, dirname, basename } from 'path'
import { execSync } from 'child_process'

const ROOT = join(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')
const CONTEXT_DIR = join(ROOT, '.clew', 'context')

const moduleArg = process.argv[2]
if (!moduleArg) {
  console.error('Usage: bun run scripts/preload.ts <module-path>')
  console.error('  e.g. bun run scripts/preload.ts bridge')
  console.error('  e.g. bun run scripts/preload.ts src/bridge')
  process.exit(1)
}

const modPath = moduleArg.replace(/\\/g, '/').replace(/^src\//, '')
const targetDir = join(SRC, modPath)

function run(cmd: string): string {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'ignore'] })
  } catch (e: any) {
    return e.stdout || ''
  }
}

function findFiles(dir: string): string[] {
  try {
    const entries = readdirSync(dir)
    return entries
      .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
      .map(f => join(dir, f))
      .filter(f => statSync(f).isFile())
  } catch {
    return []
  }
}

// ── Gather data ──
const files = findFiles(targetDir)

const md: string[] = []
md.push(`# Context: ${modPath}`)
md.push(`_Preloaded ${new Date().toISOString().slice(0, 16).replace('T', ' ')}_`)
md.push('')

// Summary
md.push(`## Scope`)
md.push('')
md.push(`Module: \`${modPath}\``)
md.push(`Files: ${files.length}`)
md.push('')

// File listing with sizes
md.push(`## Files`)
md.push('')
md.push(`| File | Lines | Exports | TODOs |`)
md.push(`|------|-------|---------|-------|`)

let totalLines = 0
for (const file of files) {
  const relName = file.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '')
  const content = readFileSync(file, 'utf-8')
  const lines = content.split('\n').length
  totalLines += lines

  const exports = content.match(/export (async )?(function|const|class|interface|type) [a-zA-Z_$][a-zA-Z0-9_$]*/g) || []
  const exportList = exports.map(e => e.split(/\s+/).pop()).filter(Boolean).slice(0, 8).join(', ')
  const todos = (content.match(/\bTODO|FIXME\b/g) || []).length

  md.push(`| ${relName} | ${lines} | ${exportList || '-'} | ${todos || '-'} |`)
}

md.push(`| **Total** | **${totalLines}** | | |`)
md.push('')

// Internal dependencies
md.push(`## Internal Dependencies`)
md.push('')
md.push('```')
const deps = files.map(f => {
  const c = readFileSync(f, 'utf-8')
  return [...c.matchAll(/from\s+['"](src\/[^'"]+)['"]/g)].map(m => m[1])
}).flat()
const uniqueDeps = [...new Set(deps)].sort()
for (const d of uniqueDeps) md.push(d)
if (!uniqueDeps.length) md.push('(none)')
md.push('```')
md.push('')

// Recent git history
md.push(`## Recent Changes`)
md.push('')
md.push('```')
try {
  const gitLog = run(`git log --oneline -10 -- "src/${modPath}/"`).trim()
  md.push(gitLog || '(no recent changes)')
} catch {
  md.push('(no git history)')
}
md.push('```')
md.push('')

// Key types
const typePattern = /export (interface|type) (\w+)/g
const allTypes: string[] = []
for (const file of files) {
  const c = readFileSync(file, 'utf-8')
  let m: RegExpExecArray | null
  while ((m = typePattern.exec(c)) !== null) allTypes.push(m[2])
}
if (allTypes.length) {
  md.push(`## Key Types`)
  md.push('')
  md.push('- ' + [...new Set(allTypes)].join('\n- '))
  md.push('')
}

// Open TODOs
const allTodos: { file: string; line: string }[] = []
for (const file of files) {
  const c = readFileSync(file, 'utf-8')
  const lines = c.split('\n')
  lines.forEach((l, i) => {
    if (/\bTODO|FIXME\b/.test(l)) {
      const text = l.replace(/^\s*\/\/\s*/, '').replace(/^\s*/, '').slice(0, 80)
      allTodos.push({ file: file.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', ''), line: text })
    }
  })
}

if (allTodos.length) {
  md.push(`## Open TODOs`)
  md.push('')
  for (const t of allTodos) md.push(`- \`${t.file}\`: ${t.line}`)
  md.push('')
}

// Write
mkdirSync(CONTEXT_DIR, { recursive: true })
const outPath = join(CONTEXT_DIR, `${modPath.replace(/\//g, '-')}.md`)
writeFileSync(outPath, md.join('\n'), 'utf-8')

console.log(`\n✅ Preloaded: ${modPath}`)
console.log(`   ${files.length} files, ${totalLines} lines`)
console.log(`   Saved to: ${outPath}`)
console.log('')
console.log('Claude Code can now read this context via Read tool.')
