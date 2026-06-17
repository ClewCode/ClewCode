/**
 * Browser Tool — Full Stealth Handler with Extended Controls
 */

import { getBrowserSession } from './BrowserSession.js';
import type { BrowserActionInput, BrowserResult } from './types.js';

const DEFAULT_ACTION_TIMEOUT_MS = 3_000;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 10_000;
const DEFAULT_SCREENSHOT_TIMEOUT_MS = 2_500;
const POST_ACTION_SETTLE_MS = 300;

const VIRTUAL_CURSOR_ID = 'claude-virtual-cursor';
const STOP_BUTTON_ID = 'claude-stop-button';

async function ensureVirtualControls(page: any) {
  await page
    .evaluate(
      ({ cursorId, stopId }: any) => {
        if (!document.getElementById(cursorId)) {
          const cursor = document.createElement('div');
          cursor.id = cursorId;
          cursor.style.position = 'fixed';
          cursor.style.zIndex = '2147483647';
          cursor.style.pointerEvents = 'none';
          cursor.style.width = '24px';
          cursor.style.height = '24px';
          cursor.style.transition = 'all 0.2s ease-out';
          cursor.style.display = 'none';
          cursor.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z" fill="white" stroke="black"/></svg>`;
          document.body.appendChild(cursor);
        }
        if (!document.getElementById(stopId)) {
          const btn = document.createElement('div');
          btn.id = stopId;
          btn.innerHTML = '🛑 STOP AGENT';
          btn.style.position = 'fixed';
          btn.style.bottom = '30px';
          btn.style.left = '50%';
          btn.style.transform = 'translateX(-50%)';
          btn.style.zIndex = '2147483647';
          btn.style.backgroundColor = 'rgba(255, 68, 68, 0.9)';
          btn.style.color = 'white';
          btn.style.padding = '12px 24px';
          btn.style.borderRadius = '30px';
          btn.style.cursor = 'pointer';
          btn.onclick = () => {
            (window as any).claudeStopped = true;
            btn.innerHTML = '⌛ STOPPING...';
          };
          document.body.appendChild(btn);
        }
      },
      { cursorId: VIRTUAL_CURSOR_ID, stopId: STOP_BUTTON_ID },
    )
    .catch(() => undefined);
}

async function checkStopped(page: any) {
  const stopped = await page.evaluate(() => (window as any).claudeStopped === true).catch(() => false);
  if (stopped) throw new Error('Action aborted by user');
}

async function successResult(
  page: any,
  opts?: { extra?: Partial<BrowserResult>; skipScreenshot?: boolean },
): Promise<BrowserResult> {
  const result: BrowserResult = { ok: true, url: page.url(), title: await page.title() };
  if (!opts?.skipScreenshot) {
    try {
      await ensureVirtualControls(page);
      const screenshot = await page.screenshot({
        type: 'jpeg',
        quality: 45,
        scale: 'css',
        timeout: DEFAULT_SCREENSHOT_TIMEOUT_MS,
      });
      result.screenshot = screenshot.toString('base64');
    } catch {
      // Screenshot capture is best-effort; the action result is still useful without it.
    }
  }
  if ((page as any)._browserLogs?.length > 0) {
    result.content = `${result.content || ''}\n\n--- BROWSER CONSOLE ---\n${(page as any)._browserLogs.join('\n')}`;
    (page as any)._browserLogs = [];
  }
  if (opts?.extra) Object.assign(result, opts.extra);
  return result;
}

async function waitAfterInteraction(page: any) {
  await page.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => undefined);
  await page.waitForTimeout(POST_ACTION_SETTLE_MS).catch(() => undefined);
}

export async function handleBrowserAction(input: BrowserActionInput): Promise<BrowserResult> {
  const session = getBrowserSession();
  await session.ensureInitialized();
  const page = session.getActivePage();
  const timeout = input.timeout || DEFAULT_ACTION_TIMEOUT_MS;
  page.setDefaultTimeout(timeout);

  try {
    await checkStopped(page);

    switch (input.action) {
      case 'navigate':
        if (!input.url) throw new Error('URL required');
        await page.goto(input.url, {
          waitUntil: 'networkidle',
          timeout: input.timeout || DEFAULT_NAVIGATION_TIMEOUT_MS,
        });
        return successResult(page);

      case 'search': {
        if (!input.query) throw new Error('Query required for search');
        const engine = input.engine || 'google';
        if (engine === 'google') await page.goto(`https://www.google.com/search?q=${encodeURIComponent(input.query)}`);
        else if (engine === 'bing') await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(input.query)}`);
        else if (engine === 'duckduckgo')
          await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(input.query)}`);
        else if (engine === 'github') await page.goto(`https://github.com/search?q=${encodeURIComponent(input.query)}`);
        else await page.goto(`https://www.google.com/search?q=${encodeURIComponent(input.query)}`);
        return successResult(page);
      }

      case 'click':
        if (!input.selector) throw new Error('Selector required');
        await page
          .locator(input.selector)
          .first()
          .scrollIntoViewIfNeeded({ timeout: input.timeout || DEFAULT_ACTION_TIMEOUT_MS })
          .catch(() => undefined);
        await page.click(input.selector, { timeout: input.timeout || DEFAULT_ACTION_TIMEOUT_MS }).catch(async () => {
          await page
            .locator(input.selector)
            .first()
            .evaluate((el: HTMLElement) => el.click());
        });
        await waitAfterInteraction(page);
        return successResult(page);

      case 'click_at': {
        if (typeof input.x !== 'number' || typeof input.y !== 'number') throw new Error('x + y required');
        await page.mouse
          .click(input.x, input.y, { timeout: input.timeout || DEFAULT_ACTION_TIMEOUT_MS })
          .catch(async () => {
            await page.evaluate(
              ({ x, y }: { x: number; y: number }) => {
                const el = document.elementFromPoint(x, y) as HTMLElement | null;
                el?.click();
              },
              { x: input.x!, y: input.y! },
            );
          });
        await waitAfterInteraction(page);
        return successResult(page);
      }

      case 'click_text':
        if (!input.text) throw new Error('Text required');
        await page
          .getByText(input.text, { exact: false })
          .first()
          .click({ timeout: input.timeout || DEFAULT_ACTION_TIMEOUT_MS });
        await waitAfterInteraction(page);
        return successResult(page);

      case 'click_role':
        if (!input.role) throw new Error('Role required');
        await page
          .getByRole(input.role as any, input.name ? { name: input.name, exact: false } : undefined)
          .first()
          .click({ timeout: input.timeout || DEFAULT_ACTION_TIMEOUT_MS });
        await waitAfterInteraction(page);
        return successResult(page);

      case 'type_at':
        if (typeof input.x !== 'number' || typeof input.y !== 'number' || !input.text)
          throw new Error('x, y, and text required for type_at');
        await page.mouse.click(input.x, input.y, { clickCount: 3 }); // Select all existing text
        await page.keyboard.press('Backspace');
        await page.keyboard.type(input.text, { delay: 50 });
        return successResult(page);

      case 'type':
        if (!input.selector || !input.text) throw new Error('Selector + text required');
        await page
          .locator(input.selector)
          .first()
          .scrollIntoViewIfNeeded({ timeout: input.timeout || DEFAULT_ACTION_TIMEOUT_MS })
          .catch(() => undefined);
        await page.click(input.selector, { timeout: input.timeout || DEFAULT_ACTION_TIMEOUT_MS }).catch(async () => {
          await page.locator(input.selector).first().focus();
        });
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => undefined);
        await page.keyboard.type(input.text, { delay: 50 });
        return successResult(page);

      case 'fill':
        if (!input.selector || !input.text) throw new Error('Selector + text required');
        await page.fill(input.selector, input.text);
        return successResult(page);

      case 'fill_label':
        if (!input.label || !input.text) throw new Error('Label + text required');
        await page.getByLabel(input.label).fill(input.text);
        return successResult(page);

      case 'clear':
        if (!input.selector) throw new Error('Selector required');
        await page.locator(input.selector).first().fill('');
        return successResult(page);

      case 'select':
        if (!input.selector || input.value === undefined) throw new Error('Selector + value required');
        await page.selectOption(input.selector, input.value);
        return successResult(page);

      case 'check':
        if (!input.selector) throw new Error('Selector required');
        await page
          .locator(input.selector)
          .first()
          .check({ timeout: input.timeout || DEFAULT_ACTION_TIMEOUT_MS });
        return successResult(page);

      case 'uncheck':
        if (!input.selector) throw new Error('Selector required');
        await page
          .locator(input.selector)
          .first()
          .uncheck({ timeout: input.timeout || DEFAULT_ACTION_TIMEOUT_MS });
        return successResult(page);

      case 'press':
        if (!input.key) throw new Error("Key required (e.g., 'Enter')");
        if (input.selector) await page.press(input.selector, input.key);
        else await page.keyboard.press(input.key);
        return successResult(page);

      case 'scroll': {
        const delta = input.direction === 'up' ? -(input.amount || 500) : input.amount || 500;
        const scrollState = await page.evaluate(() => ({
          x: window.scrollX,
          y: window.scrollY,
          maxY: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight,
        }));
        const targetX = typeof input.x === 'number' ? input.x : await page.evaluate(() => window.innerWidth / 2);
        const targetY = typeof input.y === 'number' ? input.y : await page.evaluate(() => window.innerHeight / 2);
        await page.mouse.move(targetX, targetY).catch(() => undefined);
        await page.mouse.wheel(0, delta).catch(() => undefined);
        await page.waitForTimeout(POST_ACTION_SETTLE_MS).catch(() => undefined);
        const wheelMoved = await page.evaluate(({ beforeY }) => window.scrollY !== beforeY, { beforeY: scrollState.y });
        if (!wheelMoved) {
          await page.evaluate(
            ({ d, x, y }: { d: number; x?: number; y?: number }) => {
              const scrollElement = (el: HTMLElement | null) => {
                while (el && el !== document.body) {
                  const style = window.getComputedStyle(el);
                  const canScroll = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight;
                  if (canScroll) {
                    const before = el.scrollTop;
                    el.scrollBy(0, d);
                    return el.scrollTop !== before;
                  }
                  el = el.parentElement;
                }
                return false;
              };

              const targetX = typeof x === 'number' ? x : window.innerWidth / 2;
              const targetY = typeof y === 'number' ? y : window.innerHeight / 2;
              const center = document.elementFromPoint(targetX, targetY);
              if (scrollElement(center?.closest('*') as HTMLElement | null)) return;

              const scrollables = Array.from(document.querySelectorAll('*')).filter((node): node is HTMLElement => {
                const el = node as HTMLElement;
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return (
                  /(auto|scroll)/.test(style.overflowY) &&
                  el.scrollHeight > el.clientHeight &&
                  rect.width > 0 &&
                  rect.height > 0 &&
                  rect.bottom > 0 &&
                  rect.right > 0 &&
                  rect.top < window.innerHeight &&
                  rect.left < window.innerWidth
                );
              });
              scrollables.sort((a, b) => {
                const ar = a.getBoundingClientRect();
                const br = b.getBoundingClientRect();
                return br.width * br.height - ar.width * ar.height;
              });
              if (scrollElement(scrollables[0] ?? null)) return;

              const before = window.scrollY;
              window.scrollBy(0, d);
              if (window.scrollY !== before) return;

              const root = document.scrollingElement as HTMLElement | null;
              if (root) {
                root.scrollBy(0, d);
              }
            },
            { d: delta, x: input.x, y: input.y },
          );
        }
        await page.waitForTimeout(POST_ACTION_SETTLE_MS).catch(() => undefined);
        const result = await successResult(page, {
          extra: {
            content: JSON.stringify({
              before: scrollState,
              after: await page.evaluate(() => ({
                x: window.scrollX,
                y: window.scrollY,
                maxY: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight,
              })),
            }),
          },
        });
        return result;
      }

      case 'extract':
        return { ok: true, url: page.url(), title: await page.title(), content: await page.content() };

      case 'extract_data':
      case 'get_text':
        if (input.selector) {
          const text = await page.locator(input.selector).first().innerText();
          return { ok: true, url: page.url(), title: await page.title(), content: text };
        }
        return {
          ok: true,
          url: page.url(),
          title: await page.title(),
          content: await page.evaluate(() => document.body.innerText),
        };

      case 'get_attribute':
        if (!input.selector || !input.attribute) throw new Error('Selector + attribute required');
        return {
          ok: true,
          url: page.url(),
          title: await page.title(),
          content: (await page.locator(input.selector).first().getAttribute(input.attribute)) ?? '',
        };

      case 'get_value':
        if (!input.selector) throw new Error('Selector required');
        return {
          ok: true,
          url: page.url(),
          title: await page.title(),
          content: await page.locator(input.selector).first().inputValue(),
        };

      case 'get_links':
        return {
          ok: true,
          url: page.url(),
          title: await page.title(),
          content: JSON.stringify(
            await page.evaluate(() =>
              Array.from(document.querySelectorAll('a')).map(link => ({
                text: link.textContent?.replace(/\s+/g, ' ').trim() || '',
                href: link.href,
              })),
            ),
          ),
        };

      case 'get_inputs':
        return {
          ok: true,
          url: page.url(),
          title: await page.title(),
          content: JSON.stringify(
            await page.evaluate(() =>
              Array.from(document.querySelectorAll('input, textarea, select')).map(input => {
                const el = input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
                const id = el.id;
                const label =
                  (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : undefined) ||
                  el.closest('label')?.textContent ||
                  '';
                return {
                  tag: el.tagName.toLowerCase(),
                  type: el instanceof HTMLInputElement ? el.type : undefined,
                  name: el.getAttribute('name') || '',
                  id,
                  placeholder: el.getAttribute('placeholder') || '',
                  label: label.replace(/\s+/g, ' ').trim(),
                };
              }),
            ),
          ),
        };

      case 'switch_tab': {
        const pages = await session.listTabs();
        const targetIndex = typeof input.index === 'number' ? input.index : -1;
        let newPage: any;
        if (targetIndex >= 0 && targetIndex < pages.length) {
          newPage = await session.switchTab(targetIndex);
        } else {
          // Legacy: rotate to next tab
          const _current = session.getActivePage();
          const currentIndex = pages.findIndex(t => t.active);
          const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % pages.length : 0;
          newPage = await session.switchTab(nextIndex);
        }
        return successResult(newPage);
      }

      case 'open_new_tab': {
        const newPage = await session.openNewTab(input.url);
        return successResult(newPage);
      }

      case 'close_tab': {
        try {
          const closedPage = await session.closeTab(typeof input.index === 'number' ? input.index : -1);
          return successResult(closedPage);
        } catch (e: any) {
          return { ok: false, url: '', title: '', error: e.message };
        }
      }

      case 'list_tabs': {
        const tabs = await session.listTabs();
        const active = session.getActivePage();
        return {
          ok: true,
          url: active?.url() || '',
          title: (await active?.title().catch(() => '')) || '',
          tabs,
        };
      }

      case 'upload':
        if (!input.selector || !input.filePath) throw new Error('Selector + filePath required for upload');
        await page.locator(input.selector).setInputFiles(input.filePath);
        return successResult(page);

      case 'drag_and_drop':
        if (!input.selector || !input.text)
          throw new Error('Source selector (selector) and target selector (text) required');
        await page.dragAndDrop(input.selector, input.text);
        return successResult(page);

      case 'go_back':
        await page.goBack({ waitUntil: 'networkidle', timeout: input.timeout || DEFAULT_NAVIGATION_TIMEOUT_MS });
        return successResult(page);

      case 'go_forward':
        await page.goForward({ waitUntil: 'networkidle', timeout: input.timeout || DEFAULT_NAVIGATION_TIMEOUT_MS });
        return successResult(page);

      case 'reload':
        await page.reload({ waitUntil: 'networkidle', timeout: input.timeout || DEFAULT_NAVIGATION_TIMEOUT_MS });
        return successResult(page);

      case 'hover':
        if (!input.selector) throw new Error('Selector required');
        await page
          .locator(input.selector)
          .first()
          .hover({ timeout: input.timeout || DEFAULT_ACTION_TIMEOUT_MS });
        return successResult(page);

      case 'focus':
        if (!input.selector) throw new Error('Selector required');
        await page
          .locator(input.selector)
          .first()
          .focus({ timeout: input.timeout || DEFAULT_ACTION_TIMEOUT_MS });
        return successResult(page);

      case 'frame_click':
        if (!input.frameSelector || !input.selector) throw new Error('Frame selector + selector required');
        await page
          .frameLocator(input.frameSelector)
          .locator(input.selector)
          .first()
          .click({
            timeout: input.timeout || DEFAULT_ACTION_TIMEOUT_MS,
          });
        await waitAfterInteraction(page);
        return successResult(page);

      case 'frame_fill':
        if (!input.frameSelector || !input.selector || !input.text)
          throw new Error('Frame selector + selector + text required');
        await page
          .frameLocator(input.frameSelector)
          .locator(input.selector)
          .first()
          .fill(input.text, {
            timeout: input.timeout || DEFAULT_ACTION_TIMEOUT_MS,
          });
        return successResult(page);

      case 'handle_dialog':
        page.once('dialog', async (dialog: any) => {
          if (input.dialogAction === 'dismiss') {
            await dialog.dismiss();
            return;
          }
          await dialog.accept(input.dialogText);
        });
        return successResult(page, { skipScreenshot: true, extra: { content: 'Dialog handler registered.' } });

      case 'wait_for':
        if (!input.selector) throw new Error('Selector required');
        await page.waitForSelector(input.selector, {
          state: 'visible',
          timeout: input.timeout || DEFAULT_ACTION_TIMEOUT_MS,
        });
        return successResult(page);

      case 'wait_for_url':
        if (!input.url) throw new Error('URL pattern required');
        await page.waitForURL(new RegExp(input.url, 'i'), { timeout: input.timeout || DEFAULT_ACTION_TIMEOUT_MS });
        return successResult(page);

      case 'wait':
        await page.waitForTimeout(Math.min(input.timeout || 1500, 10000));
        await page.waitForLoadState('domcontentloaded', { timeout: 1000 }).catch(() => undefined);
        await page.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => undefined);
        return successResult(page);

      case 'screenshot':
        return successResult(page);

      case 'status':
        return successResult(page, { skipScreenshot: true });

      case 'evaluate': {
        if (!input.expression) throw new Error('Expression required');
        const res = await page.evaluate(input.expression);
        return {
          ok: true,
          url: page.url(),
          title: await page.title(),
          content: JSON.stringify(res),
        };
      }

      case 'close':
        await page
          .evaluate(() => {
            document.querySelectorAll('.claude-vision-label').forEach(el => {
              el.remove();
            });
          })
          .catch(() => undefined);
        await session.close();
        return { ok: true, url: '', title: 'Closed' };

      default:
        throw new Error(`Unsupported browser action: ${input.action}`);
    }
  } catch (error: any) {
    return { ok: false, url: page.url(), title: '', error: error.message };
  }
}
