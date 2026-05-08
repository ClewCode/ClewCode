import { registerBundledSkill } from '../bundledSkills.js'

const WEB_SEARCH_PROMPT = `# Web Search Skill

You are searching the web for current information.

## Your Task

The user wants to search for: {{query}}

Search engine: {{engine}}

## Steps

### 1. Execute Search

**For Google (default):**
Use the WebFetch tool to get search results from Google. Format the URL as:
https://www.google.com/search?q=ENCODED_QUERY&num=10

**For Bing:**
Use the WebFetch tool to get results from Bing:
https://www.bing.com/search?q=ENCODED_QUERY&count=50

**For DuckDuckGo (ddg):**
Run this command:
\`\`\`bash
curl -s "https://api.duckduckgo.com/?q={{query}}&format=json&pretty=1"
\`\`\`
Then extract AbstractText, AbstractURL, and RelatedTopics.

### 2. Present Results

Format results as markdown with:
- Title as clickable link
- Brief description
- Source URL

**Important**: Always include source URLs in your response.
`

export function registerWebSearchSkill(): void {
  registerBundledSkill({
    name: 'web-search',
    description: 'Search the web using Google, Bing, or DuckDuckGo',
    userInvocable: true,
    argumentHint: '[google|bing|ddg] <query>',
    async getPromptForCommand(args) {
      const parts = args.trim().split(/\s+/)
      let engine = 'google'
      let query = args

      // Check if first arg is a known engine
      if (['google', 'bing', 'ddg', 'duckduckgo'].includes(parts[0]?.toLowerCase())) {
        engine = parts[0].toLowerCase()
        query = parts.slice(1).join(' ')
      }

      const prompt = WEB_SEARCH_PROMPT
        .replace('{{query}}', query || 'the search query')
        .replace('{{engine}}', engine)

      return [{ type: 'text', text: prompt }]
    },
  })
}