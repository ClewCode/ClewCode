/**
 * BrowserSession — Centralized browser tab manager
 *
 * Owns the Playwright browser lifecycle and tab state so that
 * callers (handler, agent) never touch browserContext/pageInstance
 * globals directly.
 */

import net from 'node:net';

// Monkey-patch to fix Bun + Playwright on Windows
const _originalSocketConnect = (net.Socket.prototype as any).connect;
(net.Socket.prototype as any).connect = function (...args: any[]) {
  let options = args[0];
  if (Array.isArray(options)) options = options[0];
  const hasFd = options && typeof options === 'object' && 'fd' in options && options.fd != null;
  const result = _originalSocketConnect.apply(this, args);
  if (hasFd && (this as any).connecting) {
    (this as any).connecting = false;
    process.nextTick(() => {
      if (!this.destroyed && !(this as any).connected) {
        (this as any).connected = true;
        this.emit('connect');
      }
    });
  }
  return result;
};

const BLOCKED_DOMAINS = [
  'datadome.co',
  'fingerprint.com',
  'fingerprintjs.com',
  'perimeterx.net',
  'px-cdn.net',
  'kasada.io',
];

export interface TabInfo {
  index: number;
  title: string;
  url: string;
  active: boolean;
}

export class BrowserSession {
  private browser: any = null;
  private context: any = null;
  private pages: any[] = [];
  private activeIndex = 0;
  private headless = ['1', 'true'].includes((process.env.BROWSER_TOOL_HEADLESS || '').toLowerCase());

  async init(input?: { headless?: boolean; url?: string }): Promise<void> {
    if (this.context) return;

    this.headless = input?.headless ?? this.headless;
    const { chromium } = await import('playwright');
    this.browser = await chromium.launch({
      headless: this.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--start-maximized',
      ],
    });
    this.context = await this.browser.newContext({
      viewport: null,
      timezoneId: 'Asia/Bangkok',
      locale: 'th-TH',
    });

    if (input?.url) {
      const page = await this.context.newPage();
      await this.setupPage(page);
      await page.goto(input.url, { waitUntil: 'networkidle' });
      this.pages = [page];
      this.activeIndex = 0;
    } else {
      let pages = this.context.pages();
      // Playwright may not create a default page in headless Windows — ensure one exists
      if (pages.length === 0) {
        const page = await this.context.newPage();
        await this.setupPage(page);
        pages = [page];
      } else {
        for (const p of pages) {
          await this.setupPage(p);
        }
      }
      this.pages = pages;
      this.activeIndex = 0;
    }
  }

  async ensureInitialized(): Promise<void> {
    if (!this.context) {
      await this.init();
    }
  }

  getActivePage(): any {
    if (!this.context || this.pages.length === 0) return null;
    return this.pages[this.activeIndex] ?? this.pages[0];
  }

  async switchTab(index: number): Promise<any> {
    await this.ensureInitialized();
    await this.syncPages();
    if (index < 0 || index >= this.pages.length) {
      throw new Error(`Tab index ${index} out of range (0-${this.pages.length - 1})`);
    }
    this.activeIndex = index;
    const page = this.pages[index];
    await page.bringToFront();
    return page;
  }

  async closeTab(index: number): Promise<any> {
    await this.ensureInitialized();
    await this.syncPages();
    if (index < 0 || index >= this.pages.length) {
      throw new Error(`Tab index ${index} out of range (0-${this.pages.length - 1})`);
    }
    if (this.pages.length <= 1) {
      throw new Error('Cannot close the only tab');
    }

    const target = this.pages[index];
    await target.close();

    // Adjust active index
    if (index === this.activeIndex) {
      this.activeIndex = Math.min(index, this.pages.length - 2);
    } else if (index < this.activeIndex) {
      this.activeIndex -= 1;
    }

    await this.syncPages();
    return this.getActivePage();
  }

  async openNewTab(url?: string): Promise<any> {
    await this.ensureInitialized();
    const page = await this.context.newPage();
    await this.setupPage(page);
    if (url) {
      await page.goto(url, { waitUntil: 'networkidle' });
    }
    await this.syncPages();
    this.activeIndex = this.pages.length - 1;
    await page.bringToFront();
    return page;
  }

  async listTabs(): Promise<TabInfo[]> {
    await this.ensureInitialized();
    await this.syncPages();
    const active = this.getActivePage();
    return Promise.all(
      this.pages.map(async (p, i) => ({
        index: i,
        title: await p.title().catch(() => ''),
        url: p.url() || 'about:blank',
        active: p === active,
      })),
    );
  }

  async close(): Promise<void> {
    try {
      if (this.context) await this.context.close();
    } catch {
      // ignore
    }
    try {
      if (this.browser) await this.browser.close();
    } catch {
      // ignore
    }
    this.browser = null;
    this.context = null;
    this.pages = [];
    this.activeIndex = 0;
  }

  private async syncPages(): Promise<void> {
    if (!this.context) return;
    this.pages = this.context.pages();
    // Guard against stale activeIndex
    if (this.activeIndex >= this.pages.length) {
      this.activeIndex = Math.max(0, this.pages.length - 1);
    }
  }

  private async setupPage(page: any): Promise<void> {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'languages', { get: () => ['th-TH', 'th', 'en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      const g = globalThis as any;
      if (!g.chrome) g.chrome = {};
      g.chrome.runtime = {};

      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter.apply(this, [parameter]);
      };
    });

    await page.route('**/*', (route: any) => {
      const url = route.request().url();
      if (BLOCKED_DOMAINS.some(d => url.includes(d))) return route.abort();
      return route.continue();
    });

    // Capture console logs
    (page as any)._browserLogs = [];
    page.on('console', (msg: any) => {
      (page as any)._browserLogs.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (err: any) => {
      (page as any)._browserLogs.push(`[ERROR] ${err.message}`);
    });
  }
}

// Singleton per process
let session: BrowserSession | null = null;

export function getBrowserSession(): BrowserSession {
  if (!session) {
    session = new BrowserSession();
  }
  return session;
}
