/**
 * Standalone Playwright Test — Zero framework dependency
 * Tests that Playwright can launch, navigate, and screenshot on this machine.
 * Run with: npx tsx scratch/test_playwright_standalone.ts
 */

import { chromium } from 'playwright';
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


async function main() {
  console.log("=== Standalone Playwright Test ===");
  console.log("1️⃣  Launching Chromium (persistent context)...");
  const fs = await import('fs');
  fs.mkdirSync('scratch/test_profile', { recursive: true });
  
  const context = await chromium.launchPersistentContext('scratch/test_profile', { 
    headless: true,
    viewport: { width: 1280, height: 800 }
  });
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  console.log("2️⃣  Navigating to Google...");
  await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
  console.log(`   URL: ${page.url()}`);
  console.log(`   Title: ${await page.title()}`);

  console.log("3️⃣  Taking screenshot...");
  const screenshot = await page.screenshot({ type: 'jpeg', quality: 50 });
  console.log(`   Screenshot size: ${screenshot.length} bytes`);
  
  // Save screenshot to verify visually
  fs.writeFileSync('scratch/test_screenshot.jpg', screenshot);
  console.log("   Saved to scratch/test_screenshot.jpg");

  console.log("4️⃣  Getting page structure...");
  const links = await page.locator('a').count();
  const inputs = await page.locator('input, textarea').count();
  const buttons = await page.locator('button, [role="button"]').count();
  console.log(`   Links: ${links}, Inputs: ${inputs}, Buttons: ${buttons}`);

  console.log("5️⃣  Typing search query...");
  // Google search box selector
  const searchBox = page.locator('textarea[name="q"], input[name="q"]');
  await searchBox.fill('Claude Code GitHub');
  await searchBox.press('Enter');
  await page.waitForLoadState('domcontentloaded');
  console.log(`   New URL: ${page.url()}`);
  console.log(`   New Title: ${await page.title()}`);

  console.log("6️⃣  Extracting first result...");
  try {
    const firstResult = await page.locator('h3').first().textContent({ timeout: 5000 });
    console.log(`   First result: ${firstResult}`);
  } catch {
    console.log("   Could not find h3 element (might be CAPTCHA or different layout)");
  }

  console.log("7️⃣  Closing browser...");
  await context.close();
  console.log("✅ ALL TESTS PASSED!");
}

main().catch(err => {
  console.error("❌ TEST FAILED:", err.message);
  process.exit(1);
});
