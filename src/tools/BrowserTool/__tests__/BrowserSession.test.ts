import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { BrowserSession } from '../BrowserSession.js';

describe('BrowserSession', () => {
  let session: BrowserSession;

  beforeAll(async () => {
    session = new BrowserSession();
  }, 5000);

  afterAll(() => {
    // Fire-and-forget: Playwright close hangs on Windows. Skip.
  });

  it('init + getActivePage returns a page with about:blank', async () => {
    await session.init({ headless: true });
    const page = session.getActivePage();
    expect(page).toBeTruthy();
    expect(page.url()).toMatch(/^about:/);

    const tabs = await session.listTabs();
    expect(tabs.length).toBe(1);
    expect(tabs[0].active).toBe(true);
  }, 30000);

  it('openNewTab adds a tab and sets it active', async () => {
    await session.openNewTab('https://example.com');

    const tabs = await session.listTabs();
    expect(tabs.length).toBe(2);
    expect(tabs[1].url).toContain('example.com');
    expect(tabs[1].active).toBe(true);
    expect(tabs[0].active).toBe(false);
  }, 15000);

  it('switchTab switches active tab by index', async () => {
    await session.switchTab(0);

    const tabs = await session.listTabs();
    expect(tabs[0].active).toBe(true);
    expect(tabs[1].active).toBe(false);
  }, 10000);

  it('closeTab removes non-active tab', async () => {
    await session.closeTab(1); // tab 1 (example.com, not active)

    const tabs = await session.listTabs();
    expect(tabs.length).toBe(1);
    expect(tabs[0].active).toBe(true);
  }, 10000);

  it('closeTab throws on only tab', async () => {
    await expect(session.closeTab(0)).rejects.toThrow('Cannot close the only tab');
  }, 10000);

  it('switchTab throws on out-of-range', async () => {
    await expect(session.switchTab(99)).rejects.toThrow('out of range');
  }, 10000);

  it('closeTab throws on out-of-range', async () => {
    await expect(session.closeTab(99)).rejects.toThrow('out of range');
  }, 10000);
});
