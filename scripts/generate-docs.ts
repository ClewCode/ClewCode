/**
 * generate-docs.ts — Auto-generate HTML documentation from source code.
 *
 * Run: bun run scripts/generate-docs.ts
 * Reads source data and writes to docs/generated/
 *
 * Currently generates:
 * - providers.json  →  docs/generated/providers.html  (provider reference table)
 * - tool prompts    →  docs/generated/tools.html       (tool reference with prompts)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');
const DOCS = join(ROOT, 'docs');
const OUT = join(DOCS, 'generated');

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// ── Helpers ──

function html( Title: string, body: string, description = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${Title} — Clew</title>
  <meta name="description" content="${description}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/styles.css">
  <link rel="icon" type="image/svg+xml" href="../assets/clew.svg">
</head>
<body>
<header class="header">
  <div class="header-inner">
    <a href="../index.html" class="logo"><span class="logo-mark">C</span><span>Clew Code</span></a>
    <nav class="header-nav">
      <a href="../index.html">Home</a>
      <a href="../commands.html">Commands</a>
      <a href="../tools.html">Tools</a>
      <a href="../providers.html">Providers</a>
      <a href="../prompts-and-features.html">Reference</a>
      <a href="../quick-start.html">Docs</a>
    </nav>
  </div>
</header>
<div class="app">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-section">
      <div class="sidebar-label">Generated Docs</div>
      <a href="providers.html" class="sidebar-link"><span class="link-icon"></span>Providers</a>
      <a href="tools.html" class="sidebar-link"><span class="link-icon"></span>Tools</a>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-label">Static Docs</div>
      <a href="../commands.html" class="sidebar-link"><span class="link-icon"></span>Commands</a>
      <a href="../tools.html" class="sidebar-link"><span class="link-icon"></span>Tools</a>
      <a href="../providers.html" class="sidebar-link"><span class="link-icon"></span>Providers</a>
    </div>
  </aside>
  <div class="sidebar-overlay"></div>
  <div class="content-wrap"><main class="content">
    <div class="breadcrumbs"><a href="../index.html">Home</a><span class="sep">/</span><span>${Title}</span></div>
    <h1>${Title}</h1>
    <p class="section-subtitle"><em>Auto-generated from source code. Last updated: ${new Date().toISOString().slice(0, 10)}.</em></p>
    ${body}
  </main></div>
</div>
</body>
</html>`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ═══════════════════════════════════════════════════════════════════════
// 1. GENERATE PROVIDERS
// ═══════════════════════════════════════════════════════════════════════

function generateProviders(): void {
  const providers = JSON.parse(
    readFileSync(join(SRC, 'services/ai/providers.json'), 'utf8'),
  ) as Record<string, any>;

  const CAP_KEYS: Record<string, string> = {
    chat: 'Chat',
    streaming: 'Streaming',
    toolCalling: 'Tools',
    vision: 'Vision',
    jsonSchema: 'JSON Schema',
    reasoningEffort: 'Reasoning',
  };

  let rows = '';
  let detailSections = '';

  for (const [id, p] of Object.entries(providers)) {
    const caps = Object.entries(p.capabilities ?? {})
      .filter(([, v]) => v === true || v === 'full' || v === 'native')
      .map(([k]) => CAP_KEYS[k] ?? cap(k))
      .join(', ') || '—';

    const models = (p.models ?? []).map((m: any) => m.id).join(', ') || '—';

    rows += `<tr>
      <td><strong>${p.label}</strong></td>
      <td><code>${p.envKey}</code></td>
      <td>${p.defaultModel || '—'}</td>
      <td style="font-size:0.75rem">${caps}</td>
    </tr>`;

    detailSections += `<details>
      <summary><strong>${p.label}</strong> <code>${id}</code></summary>
      <p>${p.note || 'No description.'}</p>
      <table>
        <tr><th>Property</th><th>Value</th></tr>
        <tr><td>Provider ID</td><td><code>${id}</code></td></tr>
        <tr><td>Env Key</td><td><code>${p.envKey}</code></td></tr>
        <tr><td>Default Model</td><td>${p.defaultModel || '—'}</td></tr>
        <tr><td>Base URL</td><td><code>${p.defaultBaseUrl}</code></td></tr>
        <tr><td>Models URL</td><td>${p.modelsUrl ? `<code>${p.modelsUrl}</code>` : '—'}</td></tr>
        <tr><td>Local</td><td>${p.isLocal ? '✅' : '—'}</td></tr>
        <tr><td>Capabilities</td><td>${caps || '—'}</td></tr>
      </table>
      <p><strong>Models (${(p.models ?? []).length}):</strong> ${models}</p>
    </details>`;
  }

  const body = `
    <h2>All Providers</h2>
    <p>Clew supports <strong>${Object.keys(providers).length} AI providers</strong>. Switch between them at runtime with <code>/model</code> or <code>/provider-select</code>.</p>
    <div class="table-wrap"><table>
      <tr><th>Provider</th><th>Env Key</th><th>Default Model</th><th>Capabilities</th></tr>
      ${rows}
    </table></div>

    <h2>Provider Details</h2>
    <div class="provider-group">${detailSections}</div>

    <style>
      .provider-group details {
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: 8px;
        padding: 0.75rem 1rem;
        margin: 0.4rem 0;
      }
      .provider-group summary { cursor: pointer; font-weight: 600; font-size: var(--text-sm); }
      .provider-group details p { margin: 0.75rem 0; font-size: var(--text-sm); color: var(--text-secondary); }
      .provider-group details table { margin: 0.5rem 0; }
    </style>
  `;

  writeFileSync(join(OUT, 'providers.html'), html(
    'Providers (Auto-generated)',
    body,
    `Auto-generated provider reference for ${Object.keys(providers).length} AI providers in Clew Code.`,
  ));
  console.log(`✅ Generated providers.html (${Object.keys(providers).length} providers)`);
}

// ═══════════════════════════════════════════════════════════════════════
// 2. GENERATE TOOLS
// ═══════════════════════════════════════════════════════════════════════

function generateTools(): void {
  const TOOLS_DIR = join(SRC, 'tools');
  const entries = existsSync(TOOLS_DIR) ? readFileSystem(TOOLS_DIR, 1) : [];

  const toolEntries: Array<{ name: string; prompt: string; description: string }> = [];

  for (const dir of entries) {
    const promptPath = join(TOOLS_DIR, dir, 'prompt.ts');
    if (!existsSync(promptPath)) continue;

    const content = readFileSync(promptPath, 'utf8');

    // Extract DESCRIPTION export
    const descMatch = content.match(/export\s+const\s+DESCRIPTION\s*=\s*([`'"])(.+?)\1/s);
    const description = descMatch ? descMatch[2] : '';

    // Extract PROMPT export (multiline template literals)
    let prompt = '';
    const promptMatch = content.match(/export\s+const\s+PROMPT\s*=\s*`([\s\S]*?)`/);
    if (promptMatch) {
      prompt = promptMatch[1].trim();
    }

    // If no template literal, try string literal
    if (!prompt) {
      const strMatch = content.match(/export\s+const\s+PROMPT\s*=\s*['"](.+?)['"]/s);
      if (strMatch) prompt = strMatch[1].trim();
    }

    toolEntries.push({
      name: dir.replace(/Tool$/, ''),
      prompt,
      description: description || prompt.slice(0, 120),
    });
  }

  toolEntries.sort((a, b) => a.name.localeCompare(b.name));

  let rows = '';
  let promptSections = '';

  for (const t of toolEntries) {
    const desc = t.description || `Built-in tool "${t.name}". See system prompt for details.`;
    rows += `<tr><td><code>${t.name}</code></td><td>${escapeHtml(desc)}</td></tr>\n`;

    if (t.prompt) {
      promptSections += `<details>
        <summary><code>${t.name}</code> — System Prompt</summary>
        <div class="prompt-box">${escapeHtml(t.prompt)}</div>
      </details>\n`;
    }
  }

  const body = `
    <h2>All Tools with Prompts</h2>
    <p>Clew provides <strong>${toolEntries.length} tools</strong> with system prompts. These prompts are injected into the AI model's context at session start to define the tool interface.</p>
    <div class="table-wrap"><table>
      <tr><th>Tool</th><th>Description</th></tr>
      ${rows}
    </table></div>

    <h2>Tool Prompts</h2>
    <p>Each tool's system prompt, as seen by the AI model:</p>
    <div class="tool-prompts">${promptSections}</div>

    <style>
      .tool-prompts details {
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: 8px;
        margin: 0.5rem 0;
        padding: 0.75rem 1rem;
      }
      .tool-prompts summary { cursor: pointer; font-weight: 600; font-size: var(--text-sm); }
      .prompt-box {
        background: var(--code-bg);
        border: 1px solid var(--code-border);
        border-radius: 6px;
        padding: 1rem;
        margin: 0.75rem 0;
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        line-height: 1.6;
        color: var(--code-text);
        white-space: pre-wrap;
        overflow-x: auto;
      }
    </style>
  `;

  writeFileSync(join(OUT, 'tools.html'), html(
    'Tools & Prompts (Auto-generated)',
    body,
    `Auto-generated tool reference with ${toolEntries.length} system prompts for Clew Code.`,
  ));
  console.log(`✅ Generated tools.html (${toolEntries.length} tools with prompts)`);
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════

function readFileSystem(dir: string, depth: number): string[] {
  const results: string[] = [];
  const entries = existsSync(dir) ? readdirSync(dir) : [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (depth > 0) {
        results.push(entry);
      }
    }
  }
  return results;
}

import { readdirSync, statSync } from 'node:fs';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════

console.log('📄 Generating docs from source...\n');
generateProviders();
generateTools();
console.log('\n✨ Done — outputs in docs/generated/');
