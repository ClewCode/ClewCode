import { registerBundledSkill } from '../bundledSkills.js'

const SCRAPLING_PROMPT = `# Scrapling Web Scraping Skill

You are using Scrapling to scrape websites.

## Requirements

The user wants to scrape: {{url}}

{{mode}}

## Scrapling Installation

If scrapling is not installed, install it first:
\`\`\`bash
pip install scrapling
\`\`\`

## Usage

### Quick Extract (no code needed)
\`\`\`bash
scrapling extract {{fetchMode}} '{{url}}' output.md --css-selector '{{selector}}'
\`\`\`

### Python Script Mode
\`\`\`python
from scrapling.fetchers import {{fetcherClass}}

{{script}}
\`\`\`

## Steps

### 1. Analyze the Target

- Check if the site has anti-bot protection (Cloudflare, etc.)
- Determine the appropriate fetcher to use

### 2. Fetch the Page

Run the extract command or write a Python script.

### 3. Extract Data

Use CSS selectors or XPath to extract the desired content.

### 4. Format Output

Present the scraped data in a usable format (JSON, CSV, markdown table, etc.).

**Important**: Always respect robots.txt and the website's terms of service.
`

function parseScraplingArgs(args) {
  const parts = args.trim().split(/\s+/)
  const result = {
    url: '',
    mode: 'quick',
    fetchMode: 'get',
    selector: '',
    fetcherClass: 'Fetcher',
    script: ''
  }

  if (parts[0]?.startsWith('http')) {
    result.url = parts[0]
  }

  if (args.includes('--stealth') || args.includes('-s')) {
    result.mode = 'stealth'
    result.fetchMode = 'stealth-fetch'
    result.fetcherClass = 'StealthyFetcher'
  }
  if (args.includes('--dynamic') || args.includes('-d')) {
    result.mode = 'dynamic'
    result.fetchMode = 'fetch'
    result.fetcherClass = 'DynamicFetcher'
  }
  if (args.includes('css:')) {
    const cssMatch = args.match(/css:\s*(\S+)/)
    if (cssMatch) result.selector = cssMatch[1]
  }

  if (result.mode !== 'quick') {
    result.script = `from scrapling.fetchers import ${result.fetcherClass}

${result.fetcherClass}.adaptive = True
page = ${result.fetcherClass}.${result.fetchMode === 'get' ? 'get' : 'fetch'}('${result.url}')

results = page.css('${result.selector || 'body'}')
for item in results:
    print(item.text())`
  }

  return result
}

export function registerScraplingSkill() {
  registerBundledSkill({
    name: 'scrapling',
    description: 'Web scraping using Scrapling framework',
    userInvocable: true,
    allowedTools: ['Bash', 'Read'],
    argumentHint: '<URL> [options: --stealth, --dynamic, css:<selector>]',
    async getPromptForCommand(args) {
      const { url, mode, fetchMode, selector, fetcherClass, script } =
        parseScraplingArgs(args)

      const fullArgs = url || args || 'the target URL'

      const prompt = SCRAPLING_PROMPT
        .replace('{{url}}', fullArgs)
        .replace('{{mode}}', mode === 'quick'
          ? 'Using quick extract mode (no code needed)'
          : `Using ${mode} mode (${fetcherClass})`)
        .replace('{{fetchMode}}', fetchMode)
        .replace('{{selector}}', selector || 'body')
        .replace('{{fetcherClass}}', fetcherClass)
        .replace('{{script}}', script || '')

      return [{ type: 'text', text: prompt }]
    },
  })
}