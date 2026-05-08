/**
 * Browser Tool — Full Stealth Handler with Extended Controls
 *
 * 20+ actions for precise web control:
 * - Smart targeting: getByRole, getByLabel, getByText
 * - Form: fill, select dropdown, check/uncheck, file upload
 * - Navigation: back, forward, reload
 * - iFrame support, dialog handling
 * - Content extraction: getText, getAttribute, getLinks, evaluate JS
 */

import { logForDebugging } from '../../utils/debug.js'
import type { BrowserActionInput, BrowserResult } from './types.js'
import { join } from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'
import type { BrowserContext, Page } from 'playwright'

// ---------------------------------------------------------------------------
// Workaround for Bun + Playwright on Windows (oven-sh/bun#15679)
// Bun's net.Socket.connect() when given an fd sets this.connecting = true
// but never emits 'connect', causing all writes to buffer and Playwright
// to time out after 180s. This monkey-patch forces the connect event
// when an fd is passed, which matches Node.js behaviour.
// Must run BEFORE playwright is imported (first dynamic import in getBrowser).
// ---------------------------------------------------------------------------
import net from 'node:net'
const _originalSocketConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args: any[]) {
  let options = args[0]
  if (Array.isArray(options)) options = options[0]
  const hasFd = options && typeof options === 'object' && 'fd' in options && options.fd != null
  const result = _originalSocketConnect.apply(this, args)
  if (hasFd && this.connecting) {
    this.connecting = false
    process.nextTick(() => {
      if (!this.destroyed && !this.connected) {
        this.connected = true
        this.emit('connect')
      }
    })
  }
  return result
}
// ---------------------------------------------------------------------------

let browserContext: BrowserContext | null = null
let pageInstance: Page | null = null

const SESSION_DIR = join(homedir(), '.claude-code', 'browser_session')

const BLOCKED_DOMAINS = [
  'datadome.co', 'fingerprint.com', 'fingerprintjs.com',
  'perimeterx.net', 'px-cdn.net', 'kasada.io',
]

function humanDelay(min = 100, max = 300) {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

async function getBrowser(input?: BrowserActionInput) {
  if (!browserContext) {
    try { mkdirSync(SESSION_DIR, { recursive: true }) } catch {}
    const { chromium } = await import('playwright')
    logForDebugging('BrowserTool: Launching persistent context at ' + SESSION_DIR)
    try {
      browserContext = await chromium.launchPersistentContext(SESSION_DIR, {
        headless: shouldRunHeadless(input),
        viewport: { width: 1280, height: 800 },
        timezoneId: 'Asia/Bangkok',
        locale: 'th-TH',
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-dev-shm-usage',
        ],
      })
      logForDebugging('BrowserTool: Context launched successfully')
    } catch (error: any) {
      logForDebugging('BrowserTool: Failed to launch context: ' + error.message)
      throw error
    }
  }

  if (!pageInstance) {
    logForDebugging('BrowserTool: Getting first page')
    const pages = browserContext.pages()
    pageInstance = pages.length > 0 ? pages[0] : await browserContext.newPage()

    logForDebugging('BrowserTool: Page acquired, adding init scripts')
    await pageInstance.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
      Object.defineProperty(navigator, 'languages', { get: () => ['th-TH', 'th', 'en-US', 'en'] })
      const g = globalThis as any
      delete g.cdc_adoQpoasnfa76pfcZLmcfl_
      if (!g.chrome) g.chrome = {}
      g.chrome.runtime = {}
    })

    await pageInstance.route('**/*', (route: any) => {
      const url = route.request().url()
      if (BLOCKED_DOMAINS.some(d => url.includes(d))) return route.abort()
      return route.continue()
    })
  }

  return { context: browserContext, page: pageInstance }
}

// ── Helper: take screenshot and return result ───────────────────
async function successResult(page: Page, opts?: { extra?: Partial<BrowserResult>; skipScreenshot?: boolean }): Promise<BrowserResult> {
  const result: BrowserResult = {
    url: page.url(),
    title: await page.title(),
  }
  if (!opts?.skipScreenshot) {
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 70 })
    result.screenshot = screenshot.toString('base64')
  }
  if (opts?.extra) Object.assign(result, opts.extra)
  return result
}

// ── Main Handler ────────────────────────────────────────────────
export async function handleBrowserAction(input: BrowserActionInput): Promise<BrowserResult> {
  let page: Page | undefined
  let context: BrowserContext | undefined
  const timeout = input.timeout || 8000

  try {
    logForDebugging(`BrowserTool: Handling action "${input.action}"`)
    ;({ page, context } = await getBrowser(input))

    if (!page) {
      logForDebugging('BrowserTool: No page available!')
      throw new Error('Browser page could not be initialized')
    }

    // Check if the page is closed/crashed
    if (page.isClosed()) {
      logForDebugging('BrowserTool: Page is closed, creating new one')
      page = await context.newPage()
      pageInstance = page
    }
    switch (input.action) {

      // ═══════════════════════════════════════════════════════════
      // NAVIGATION
      // ═══════════════════════════════════════════════════════════
      case 'navigate': {
        if (!input.url) throw new Error('URL required')
        logForDebugging(`BrowserTool: Navigating to ${input.url}`)
        await page.waitForTimeout(humanDelay(200, 500))
        await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await page.waitForTimeout(humanDelay(500, 1500))
        return successResult(page)
      }

      case 'go_back': {
        await page.goBack({ waitUntil: 'domcontentloaded' })
        return successResult(page)
      }

      case 'go_forward': {
        await page.goForward({ waitUntil: 'domcontentloaded' })
        return successResult(page)
      }

      case 'reload': {
        await page.reload({ waitUntil: 'domcontentloaded' })
        return successResult(page)
      }

      // ═══════════════════════════════════════════════════════════
      // CLICKING — 3 strategies
      // ═══════════════════════════════════════════════════════════
      case 'click': {
        if (!input.selector) throw new Error('Selector required')
        await page.waitForSelector(input.selector, { state: 'visible', timeout })
        await page.hover(input.selector)
        await page.waitForTimeout(humanDelay(80, 250))
        await page.click(input.selector, { delay: humanDelay(40, 120) })
        await page.waitForTimeout(humanDelay(200, 500))
        return successResult(page)
      }

      case 'click_text': {
        // Click by visible text content — most human-like
        if (!input.text) throw new Error('text required for click_text')
        const loc = page.getByText(input.text, { exact: false })
        await loc.hover()
        await page.waitForTimeout(humanDelay(80, 250))
        await loc.click({ delay: humanDelay(40, 120) })
        return successResult(page)
      }

      case 'click_role': {
        // Click by ARIA role — most reliable for buttons/links
        if (!input.role) throw new Error('role required for click_role')
        const opts: any = {}
        if (input.name) opts.name = input.name
        const loc2 = page.getByRole(input.role as any, opts)
        await loc2.hover()
        await page.waitForTimeout(humanDelay(80, 250))
        await loc2.click({ delay: humanDelay(40, 120) })
        return successResult(page)
      }

      // ═══════════════════════════════════════════════════════════
      // TYPING & FORM FILLING
      // ═══════════════════════════════════════════════════════════
      case 'type': {
        // Type character-by-character with jitter (human-like)
        if (!input.selector || !input.text) throw new Error('selector + text required')
        await page.waitForSelector(input.selector, { state: 'visible', timeout })
        await page.click(input.selector)
        await page.waitForTimeout(humanDelay(100, 300))
        await page.locator(input.selector).pressSequentially(input.text, { delay: humanDelay(40, 120) })
        return successResult(page)
      }

      case 'fill': {
        // Instant fill — faster, for non-protected forms
        if (!input.selector || !input.text) throw new Error('selector + text required')
        await page.waitForSelector(input.selector, { state: 'visible', timeout })
        await page.fill(input.selector, input.text)
        return successResult(page)
      }

      case 'fill_label': {
        // Fill by form label — no CSS needed!
        if (!input.label || !input.text) throw new Error('label + text required')
        await page.getByLabel(input.label).fill(input.text)
        return successResult(page)
      }

      case 'clear': {
        if (!input.selector) throw new Error('selector required')
        await page.fill(input.selector, '')
        return successResult(page)
      }

      case 'press': {
        if (!input.key) throw new Error('key required')
        if (input.selector) {
          await page.waitForSelector(input.selector, { state: 'visible', timeout })
          await page.focus(input.selector)
        }
        await page.keyboard.press(input.key, { delay: humanDelay(50, 150) })
        return successResult(page)
      }

      // ═══════════════════════════════════════════════════════════
      // FORM CONTROLS
      // ═══════════════════════════════════════════════════════════
      case 'select': {
        if (!input.selector || !input.value) throw new Error('selector + value required')
        await page.selectOption(input.selector, input.value)
        return successResult(page)
      }

      case 'check': {
        if (!input.selector) throw new Error('selector required')
        await page.check(input.selector)
        return successResult(page)
      }

      case 'uncheck': {
        if (!input.selector) throw new Error('selector required')
        await page.uncheck(input.selector)
        return successResult(page)
      }

      case 'upload': {
        if (!input.selector || !input.filePath) throw new Error('selector + filePath required')
        await page.setInputFiles(input.selector, input.filePath)
        return successResult(page)
      }

      // ═══════════════════════════════════════════════════════════
      // SCROLL, HOVER, FOCUS
      // ═══════════════════════════════════════════════════════════
      case 'scroll': {
        const amount = input.amount || 500
        const delta = input.direction === 'up' ? -amount : amount
        const steps = 3 + Math.floor(Math.random() * 3)
        for (let i = 0; i < steps; i++) {
          await page.mouse.wheel(0, delta / steps)
          await page.waitForTimeout(humanDelay(60, 150))
        }
        return successResult(page)
      }

      case 'hover': {
        if (!input.selector) throw new Error('selector required')
        await page.hover(input.selector)
        return successResult(page)
      }

      case 'focus': {
        if (!input.selector) throw new Error('selector required')
        await page.focus(input.selector)
        return successResult(page)
      }

      // ═══════════════════════════════════════════════════════════
      // WAITING
      // ═══════════════════════════════════════════════════════════
      case 'wait_for': {
        if (!input.selector) throw new Error('selector required')
        await page.waitForSelector(input.selector, { state: 'visible', timeout })
        return successResult(page)
      }

      case 'wait_for_url': {
        if (!input.url) throw new Error('url pattern required')
        await page.waitForURL(input.url, { timeout })
        return successResult(page)
      }

      // ═══════════════════════════════════════════════════════════
      // IFRAME & DIALOG
      // ═══════════════════════════════════════════════════════════
      case 'frame_click': {
        if (!input.frameSelector || !input.selector) throw new Error('frameSelector + selector required')
        const frame = page.frameLocator(input.frameSelector)
        await frame.locator(input.selector).click()
        return successResult(page)
      }

      case 'frame_fill': {
        if (!input.frameSelector || !input.selector || !input.text) throw new Error('frameSelector + selector + text required')
        const frame2 = page.frameLocator(input.frameSelector)
        await frame2.locator(input.selector).fill(input.text)
        return successResult(page)
      }

      case 'handle_dialog': {
        const action = input.dialogAction || 'accept'
        // Use on+self-remove instead of once so it catches dialogs that are
        // already open at the time this handler is registered.
        const onDialog = async (dialog: any) => {
          page.removeListener('dialog', onDialog)
          if (action === 'accept') {
            await dialog.accept(input.dialogText || '')
          } else {
            await dialog.dismiss()
          }
        }
        page.on('dialog', onDialog)
        return { url: page.url(), title: await page.title(), content: `Dialog handler set: ${action}` }
      }

      // ═══════════════════════════════════════════════════════════
      // CONTENT EXTRACTION
      // ═══════════════════════════════════════════════════════════
      case 'screenshot':
        return successResult(page)

      case 'extract':
        return { url: page.url(), title: await page.title(), content: await page.content() }

      case 'status':
        return { url: page.url(), title: await page.title() }

      case 'get_text': {
        if (!input.selector) throw new Error('selector required')
        const text = await page.locator(input.selector).innerText()
        return { url: page.url(), title: await page.title(), content: text }
      }

      case 'get_attribute': {
        if (!input.selector || !input.attribute) throw new Error('selector + attribute required')
        const val = await page.getAttribute(input.selector, input.attribute)
        return { url: page.url(), title: await page.title(), content: val || '' }
      }

      case 'get_value': {
        if (!input.selector) throw new Error('selector required')
        const v = await page.inputValue(input.selector)
        return { url: page.url(), title: await page.title(), content: v }
      }

      case 'get_links': {
        const links = await page.$$eval('a[href]', (anchors: any[]) =>
          anchors.slice(0, 50).map(a => ({ text: a.innerText.trim().slice(0, 80), href: a.href }))
        )
        return { url: page.url(), title: await page.title(), content: JSON.stringify(links, null, 2) }
      }

      case 'get_inputs': {
        const inputs = await page.$$eval('input, textarea, select, button', (els: any[]) =>
          els.slice(0, 30).map(el => ({
            tag: el.tagName.toLowerCase(),
            type: el.type || '',
            name: el.name || '',
            id: el.id || '',
            value: el.value || '',
            placeholder: el.placeholder || '',
            label: el.labels?.[0]?.innerText?.trim() || '',
          }))
        )
        return { url: page.url(), title: await page.title(), content: JSON.stringify(inputs, null, 2) }
      }

      case 'evaluate': {
        if (!input.expression) throw new Error('expression required')
        const result = await page.evaluate(input.expression)
        return { url: page.url(), title: await page.title(), content: JSON.stringify(result) }
      }

      case 'close': {
        try { await context.storageState({ path: join(SESSION_DIR, 'state.json') }) } catch {}
        await browserContext?.close()
        browserContext = null; pageInstance = null
        return { url: '', title: 'Closed (session saved)' }
      }

      case 'search': {
        if (!input.query) throw new Error('query required for search')
        const engine = input.engine || 'google'
        const query = input.query

        const searchUrls: Record<string, (q: string) => string> = {
          google: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en`,
          bing: (q: string) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
          duckduckgo: (q: string) => `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`,
          twitter: (q: string) => `https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query`,
          reddit: (q: string) => `https://www.reddit.com/search/?q=${encodeURIComponent(q)}`,
          github: (q: string) => `https://github.com/search?q=${encodeURIComponent(q)}&type=repositories`,
        }

        const urlBuilder = searchUrls[engine] || searchUrls.google
        const searchUrl = urlBuilder(query)

        logForDebugging(`BrowserTool: Searching ${engine} for "${query}"`)
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await page.waitForTimeout(humanDelay(1500, 3000))

        // Extract results using evaluate with multi-strategy fallback selectors.
        // Each engine tries its known selectors first, falls back to generic link+h3 extraction.
        const results = await page.evaluate((engineKey: string) => {
          interface Result { title: string; link: string; snippet: string }
          const items: Result[] = []

          // ── Multi-strategy extraction by engine ──
          const strategies: Record<string, Array<() => Result[]>> = {
            google: [
              // Strategy 1: current Google layout — div.tF2Cxc containers
              () => {
                const out: Result[] = []
                const containers = document.querySelectorAll('div.tF2Cxc')
                for (const c of containers) {
                  const link = c.querySelector('a[href^="http"]')
                  const heading = c.querySelector('h3')
                  if (link && heading) {
                    out.push({
                      title: heading.innerText.trim(),
                      link: link.href,
                      snippet: c.querySelector('.VwiC3b, span.aCOpRe, div[data-sncf], div[role="heading"] + div')?.textContent?.trim() || '',
                    })
                  }
                }
                return out
              },
              // Strategy 2: older Google layout — div.g containers
              () => {
                const out: Result[] = []
                const containers = document.querySelectorAll('div.g')
                for (const c of containers) {
                  const link = c.querySelector('a[href^="http"]')
                  const heading = c.querySelector('h3')
                  if (link && heading) {
                    out.push({ title: heading.innerText.trim(), link: link.href, snippet: c.querySelector('.VwiC3b')?.textContent?.trim() || '' })
                  }
                }
                return out
              },
            ],
            bing: [
              () => {
                const out: Result[] = []
                const items_ = document.querySelectorAll('li.b_algo')
                for (const el of items_) {
                  const link = el.querySelector('a[href^="http"]')
                  const heading = el.querySelector('h2')
                  if (link && heading) {
                    out.push({ title: heading.innerText.trim(), link: link.href, snippet: el.querySelector('.b_caption p, .b_algo p')?.textContent?.trim() || '' })
                  }
                }
                return out
              },
            ],
            duckduckgo: [
              // Lite version — simple table rows
              () => {
                const out: Result[] = []
                const rows = document.querySelectorAll('table tr')
                for (const row of rows) {
                  const link = row.querySelector('a[rel="nofollow"]') as HTMLAnchorElement
                  if (link && link.href && link.innerText.trim()) {
                    const snippetTd = row.querySelectorAll('td')
                    const snippet = snippetTd.length >= 3 ? snippetTd[snippetTd.length - 1]?.innerText?.trim() : ''
                    out.push({ title: link.innerText.trim(), link: link.href, snippet: snippet || '' })
                  }
                }
                return out
              },
              // Fallback: regular DDG
              () => {
                const out: Result[] = []
                const articles = document.querySelectorAll('article')
                for (const art of articles) {
                  const link = art.querySelector('a[data-testid="result-title-a"]') || art.querySelector('a[href^="http"]')
                  const heading = art.querySelector('h2')
                  if (link && heading) {
                    out.push({ title: heading.innerText.trim(), link: (link as HTMLAnchorElement).href, snippet: art.querySelector('div[data-testid="result-snippet"]')?.textContent?.trim() || '' })
                  }
                }
                return out
              },
            ],
            twitter: [
              () => {
                const out: Result[] = []
                const tweets = document.querySelectorAll('article[data-testid="tweet"]')
                for (const t of tweets) {
                  const link = t.querySelector('a[href*="/status/"]') as HTMLAnchorElement
                  const text = t.querySelector('div[data-testid="tweetText"]')
                  if (link && text) {
                    out.push({ title: text.innerText.substring(0, 80), link: link.href, snippet: text.innerText })
                  }
                }
                return out
              },
            ],
            reddit: [
              () => {
                const out: Result[] = []
                const posts = document.querySelectorAll('faceplate-tracker[source="search_results"]')
                for (const p of posts) {
                  const link = p.querySelector('a[slot="full-post-link"]') || p.querySelector('a[slot="title"]') || p.querySelector('a[href^="http"]')
                  const title = p.querySelector('a[slot="title"]') || p.querySelector('h3')
                  if (link && title) {
                    out.push({ title: title.innerText.trim(), link: (link as HTMLAnchorElement).href, snippet: p.querySelector('div[slot="text-body"]')?.textContent?.trim() || '' })
                  }
                }
                return out
              },
            ],
            github: [
              () => {
                const out: Result[] = []
                const titles = document.querySelectorAll('div.search-title')
                for (const t of titles) {
                  const link = t.querySelector('a') as HTMLAnchorElement
                  if (link) {
                    out.push({ title: t.innerText.trim(), link: link.href, snippet: '' })
                  }
                }
                return out
              },
            ],
          }

          // ── Run engine-specific strategies ──
          const engineStrategies = strategies[engineKey] || strategies.google || []
          for (const strategy of engineStrategies) {
            const stratResults = strategy()
            if (stratResults.length > 0) {
              items.push(...stratResults)
              break // Stop at first successful strategy
            }
          }

          // ── Generic fallback: find any link+h3 pairs ──
          if (items.length === 0) {
            const seen = new Set<string>()
            const h3s = document.querySelectorAll('h3')
            for (const h3 of h3s) {
              const link = h3.closest('a') as HTMLAnchorElement
              if (link && link.href && link.href.startsWith('http') && !seen.has(link.href)) {
                const parent = link.closest('div')
                seen.add(link.href)
                items.push({
                  title: h3.innerText.trim(),
                  link: link.href,
                  snippet: parent?.querySelector('p, span, div[class*="snippet"], div[class*="desc"]')?.textContent?.trim() || '',
                })
              }
            }
          }

          return items.slice(0, 10).filter(r => r.title && r.link)
        }, engine)

        logForDebugging(`BrowserTool: Search found ${results.length} results`)
        return successResult(page, { extra: { content: JSON.stringify(results, null, 2) } })
      }

      default:
        throw new Error(`Unknown action: ${input.action}`)
    }
  } catch (error: any) {
    return { url: page?.url?.() || '', title: '', error: error.message }
  }
}

function shouldRunHeadless(input?: BrowserActionInput): boolean {
  if (input?.headless !== undefined) return input.headless
  const value = process.env.BROWSER_TOOL_HEADLESS ?? process.env.PLAYWRIGHT_HEADLESS
  if (value === undefined) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}
