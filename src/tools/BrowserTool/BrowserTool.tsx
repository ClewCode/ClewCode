/**
 * Browser Tool — Tool Definition (Extended Control)
 */

import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import * as React from 'react'
import { z } from 'zod/v4'
import { Text } from '../../ink.js'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { handleBrowserAction } from './handler.js'
import type { BrowserActionInput } from './types.js'

export const BROWSER_TOOL_NAME = 'browser' as const

const ALL_ACTIONS = [
  'navigate', 'click', 'type', 'fill', 'clear', 'press', 'scroll',
  'screenshot', 'extract', 'status', 'close',
  'click_text', 'click_role', 'fill_label',
  'select', 'check', 'uncheck', 'upload',
  'go_back', 'go_forward', 'reload',
  'hover', 'focus', 'wait_for', 'wait_for_url',
  'frame_click', 'frame_fill', 'handle_dialog',
  'get_text', 'get_attribute', 'get_value', 'get_links', 'get_inputs', 'evaluate', 'search',
] as const

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum(ALL_ACTIONS).describe('Browser action'),
    url: z.string().optional(),
    selector: z.string().optional(),
    text: z.string().optional(),
    key: z.string().optional(),
    direction: z.enum(['up', 'down']).optional(),
    amount: z.number().optional(),
    role: z.string().optional().describe('ARIA role: button, link, textbox, checkbox...'),
    name: z.string().optional().describe('Accessible name for getByRole'),
    label: z.string().optional().describe('Label text for getByLabel'),
    value: z.string().optional().describe('Value for select/attribute'),
    attribute: z.string().optional(),
    filePath: z.string().optional(),
    checked: z.boolean().optional(),
    frameSelector: z.string().optional(),
    dialogAction: z.enum(['accept', 'dismiss']).optional(),
    dialogText: z.string().optional(),
    expression: z.string().optional().describe('JavaScript expression for evaluate'),
    engine: z.enum(['google', 'bing', 'duckduckgo', 'twitter', 'reddit', 'github']).optional().describe('Search engine to use'),
    query: z.string().optional().describe('Search query'),
    timeout: z.number().optional(),
    headless: z.boolean().optional().describe('Run the browser headless for automation/testing'),
  })
)

const outputSchema = lazySchema(() =>
  z.object({
    result: z.string(),
    screenshot: z.string().optional(),
    content: z.string().optional(),
  })
)

export const BrowserTool = buildTool({
  name: BROWSER_TOOL_NAME,
  aliases: ['playwright', 'web_control'],
  searchHint: 'browse web playwright automation browser form click type',

  get inputSchema() {
    return inputSchema()
  },

  get outputSchema() {
    return outputSchema()
  },

  async description(): Promise<string> {
    return 'Control a web browser with 30+ actions: navigate, search (Google/Bing/X/Reddit), click by selector/text/role, fill forms by label, select dropdowns, upload files, handle iframes and dialogs, extract page content, and run JavaScript.'
  },

  async prompt(): Promise<string> {
    return `Control a stealth web browser (Playwright). After each action you get a screenshot.

TARGETING (choose the best strategy):
- click: Click by CSS selector
- click_text: Click by visible text (most natural)
- click_role: Click by ARIA role+name, e.g. role="button" name="Submit" (most reliable)
- hover / focus: Hover or focus an element

FORM FILLING:
- fill: Instantly set input value by CSS selector
- type: Type character-by-character with human-like delays (stealth)
- fill_label: Fill by form label text — no CSS needed! e.g. label="Email"
- clear: Clear an input field
- select: Select dropdown option by value
- check / uncheck: Toggle checkboxes
- upload: Upload file to input[type=file]
- press: Press keyboard key (Enter, Tab, Escape...)

NAVIGATION:
- navigate: Go to URL
- go_back / go_forward / reload

WAITING:
- wait_for: Wait for a CSS selector to appear
- wait_for_url: Wait for URL to match a pattern

IFRAME & DIALOG:
- frame_click / frame_fill: Interact inside iframes
- handle_dialog: Auto-accept or dismiss alert/confirm/prompt dialogs

CONTENT EXTRACTION:
- screenshot: Capture current page
- extract: Get full HTML
- get_text: Get innerText of an element
- get_attribute: Get any attribute value
- get_value: Get current value of an input
- get_links: List all links on the page (text + href)
- get_inputs: List all form inputs (type, name, id, placeholder, label)
- evaluate: Run arbitrary JavaScript and get the result
- status: Get current URL and title
- headless: Optional boolean to run browser without a visible window for automation/testing

SEARCH SKILL:
- search: Free web search (Google, Bing, DuckDuckGo, Twitter, Reddit, GitHub). Automatically extracts result titles, links, and snippets.
  Example: action="search" engine="google" query="best AI tools 2026"
  Example: action="search" engine="twitter" query="claude code release"

SESSION: close (saves cookies for next session)`
  },

  isEnabled(): boolean {
    return true
  },

  mapToolResultToToolResultBlockParam(
    data: any,
    toolUseID: string,
  ): ToolResultBlockParam {
    const content: ToolResultBlockParam['content'] = []

    // Add screenshot as image block if present
    if (data.screenshot) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: data.screenshot,
        },
      })
    }

    // Add text result
    if (data.result) {
      content.push({
        type: 'text',
        text: data.result,
      })
    }

    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: content.length > 0 ? content : data.result || 'Browser action completed',
    }
  },

  async call(input: any): Promise<{ data: any }> {
    const result = await handleBrowserAction(input as BrowserActionInput)
    if (result.error) {
      return { data: { result: `Error: ${result.error}` } }
    }
    return {
      data: {
        result: `[${result.title}] ${result.url}`,
        screenshot: result.screenshot,
        content: result.content,
      }
    }
  },

  renderToolUseMessage(input: any): React.ReactNode {
    const parts = [`🌐 ${input.action}`]
    if (input.url) parts.push(input.url)
    if (input.selector) parts.push(input.selector)
    if (input.text) parts.push(`"${input.text.substring(0, 40)}"`)
    if (input.label) parts.push(`label="${input.label}"`)
    if (input.role) parts.push(`role=${input.role}`)
    if (input.name) parts.push(`name="${input.name}"`)
    if (input.engine) parts.push(`engine=${input.engine}`)
    if (input.query) parts.push(`query="${input.query}"`)
    if (input.headless !== undefined) parts.push(`headless=${input.headless}`)
    return React.createElement(Text, null, parts.join(' '))
  },
})
