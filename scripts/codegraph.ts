#!/usr/bin/env bun
/**
 * Code Graph Generator
 *
 * Scans src/ and builds a persistent structure map of the codebase.
 * Uses ripgrep (fast, available in the project) for text patterns.
 *
 * Usage: bun run scripts/codegraph.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { execSync } from 'child_process'

const ROOT = join(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')
const OUT = join(ROOT, '.clew', 'CODEGRAPH.md')

function rg(args: string): string {
  try {
    return execSync(`rg ${args}`, { cwd: ROOT, encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'ignore'] })
  } catch (e: any) {
    return e.stdout || ''
  }
}

interface Module {
  path: string
  lines: number
  exports: string[]
  types: string[]
  classNames: string[]
  imports: string[]
  todos: number
}

// ── 1. File list ──
console.log('📁 Scanning files...')
const fileLines = rg('--count --sort path --type ts "^" src/').trim().split('\n').filter(Boolean)

const files = new Map<string, Module>()

for (const entry of fileLines) {
  const colon = entry.lastIndexOf(':')
  const relPath = entry.slice(0, colon).replace(/\\/g, '/').replace(/^src\//, '')
  const lineCount = parseInt(entry.slice(colon + 1)) || 0
  if (!relPath || relPath.startsWith('..')) continue

  files.set(relPath, {
    path: relPath,
    lines: lineCount,
    exports: [],
    types: [],
    classNames: [],
    imports: [],
    todos: 0,
  })
}
console.log(`   ${files.size} files`)

// ── 2. Exports via ripgrep (bulk) ──
console.log('🔍 Exports...')

type Field = 'exports' | 'types' | 'classNames'
const patterns: { rgPattern: string; field: Field }[] = [
  { rgPattern: 'export (async )?function [a-zA-Z_$][a-zA-Z0-9_$]*', field: 'exports' },
  { rgPattern: 'export const [a-zA-Z_$][a-zA-Z0-9_$]*', field: 'exports' },
  { rgPattern: 'export (abstract )?class [a-zA-Z_$][a-zA-Z0-9_$]*', field: 'classNames' },
  { rgPattern: 'export interface [a-zA-Z_$][a-zA-Z0-9_$]*', field: 'types' },
  { rgPattern: 'export type [a-zA-Z_$][a-zA-Z0-9_$]*', field: 'types' },
]

for (const p of patterns) {
  // Single rg call per pattern — fast
  const out = rg(`--with-filename --only-matching --no-line-number "${p.rgPattern}" src/`).trim()
  for (const line of out.split('\n').filter(Boolean)) {
    const fileSep = line.indexOf(':')
    if (fileSep === -1) continue
    const rawPath = line.slice(0, fileSep).replace(/\\/g, '/').replace(/^src\//, '')
    const matched = line.slice(fileSep + 1).trim()
    const name = matched.split(/\s+/).pop()
    if (!name || !rawPath) continue
    const f = files.get(rawPath)
    if (f && !(f[p.field] as string[]).includes(name)) {
      (f[p.field] as string[]).push(name)
    }
  }
}

// ── 3. Imports + TODOs ──
console.log('📎 Dependencies...')

for (const [relPath, info] of files) {
  try {
    const content = readFileSync(join(SRC, relPath), 'utf-8')

    // Internal imports
    const srcImports: string[] = []
    for (const line of content.split('\n')) {
      const m = line.match(/from\s+['"](src\/[^'"]+)['"]/)
      if (m) srcImports.push(m[1])
    }
    info.imports = [...new Set(srcImports)]

    // TODOs
    info.todos = (content.match(/\b(TODO|FIXME|HACK|XXX)\b/g) || []).length
  } catch {
    // skip unreadable files
  }
}

// Also add class names to exports
for (const f of files.values()) {
  for (const cls of f.classNames) {
    if (!f.exports.includes(cls)) f.exports.push(cls)
  }
}

// ── 4. Generate markdown ──
console.log('📝 Generating...')

const totalLines = [...files.values()].reduce((a, f) => a + f.lines, 0)
const totalExports = [...files.values()].reduce((a, f) => a + f.exports.length, 0)
const totalTodos = [...files.values()].reduce((a, f) => a + f.todos, 0)

const md: string[] = []
md.push('# Code Graph')
md.push('')
md.push(`_Auto-generated ${new Date().toISOString().slice(0, 10)}_`)
md.push('')
md.push(`- **Source files**: ${files.size}`)
md.push(`- **Total lines**: ${totalLines.toLocaleString()}`)
md.push(`- **Exports**: ${totalExports}`)
md.push(`- **TODOs**: ${totalTodos}`)
md.push('')

// Group by top directory
const dirMap = new Map<string, Module[]>()
for (const f of files.values()) {
  const dir = f.path.split('/')[0]
  if (!dirMap.has(dir)) dirMap.set(dir, [])
  dirMap.get(dir)!.push(f)
}

for (const [dir, dirFiles] of [...dirMap.entries()].sort()) {
  md.push(`## ${dir}/`)
  md.push('')
  dirFiles.sort((a, b) => b.lines - a.lines)

  for (const f of dirFiles) {
    if (f.lines < 25 && !f.exports.length && !f.types.length) continue

    const badges = [`${f.lines} lines`]
    if (f.todos) badges.push(`⚠️ ${f.todos}`)

    md.push(`### \`${f.path}\``)
    md.push(`_${badges.join(', ')}_`)

    if (f.exports.length) {
      const list = f.exports.slice(0, 10).join(', ')
      md.push(`- exports: ${list}${f.exports.length > 10 ? ` [+${f.exports.length - 10}]` : ''}`)
    }
    if (f.types.length) {
      const list = f.types.slice(0, 6).join(', ')
      md.push(`- types: ${list}${f.types.length > 6 ? ` [+${f.types.length - 6}]` : ''}`)
    }
    if (f.imports.length) {
      const list = f.imports.slice(0, 5).join(', ')
      md.push(`- deps: ${list}${f.imports.length > 5 ? ` (+${f.imports.length - 5})` : ''}`)
    }
    md.push('')
  }
}

// Hot dependencies
const depCount = new Map<string, number>()
for (const f of files.values()) {
  for (const dep of f.imports) {
    depCount.set(dep, (depCount.get(dep) || 0) + 1)
  }
}

const sortedDeps = [...depCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
if (sortedDeps.length) {
  md.push('---')
  md.push('## Hot Dependencies')
  md.push('')
  for (const [dep, count] of sortedDeps) {
    md.push(`- \`${dep}\` — imported by ${count} files`)
  }
  md.push('')
}

// Large files
const largeFiles = [...files.values()].filter(f => f.lines > 300).sort((a, b) => b.lines - a.lines)
if (largeFiles.length) {
  md.push('---')
  md.push('## Large Files (>300 lines)')
  md.push('')
  for (const f of largeFiles) {
    md.push(`- \`${f.path}\` — ${f.lines} lines${f.todos ? ', ⚠️' : ''}`)
  }
  md.push('')
}

// TODO hotspots
const todoFiles = [...files.values()].filter(f => f.todos > 2).sort((a, b) => b.todos - a.todos).slice(0, 10)
if (todoFiles.length) {
  md.push('---')
  md.push('## TODO Hotspots')
  md.push('')
  for (const f of todoFiles) {
    md.push(`- \`${f.path}\` — ${f.todos} TODOs`)
  }
  md.push('')
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, md.join('\n'), 'utf-8')
console.log(`\n✅ ${OUT}`)
console.log(`   ${files.size} files | ${totalLines.toLocaleString()} lines | ${totalExports} exports`)
