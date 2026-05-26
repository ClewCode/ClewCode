"""Exploratory script — understand Google Flights page structure."""
import sys
import os
from playwright.sync_api import sync_playwright

LOG_FILE = "final_runs/run_1/explore_log.txt"

def log(msg):
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")
    print(msg)

def main():
    log("=== EXPLORE SESSION ===")
    with sync_playwright() as p:
        browser = p.firefox.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 1800},
            locale="en-US",
        )
        page = context.new_page()

        # 1. Navigate to Google Flights
        log("1. Navigating to https://www.google.com/travel/flights")
        page.goto("https://www.google.com/travel/flights", wait_until="load", timeout=30000)
        page.wait_for_timeout(3000)
        page.screenshot(path="final_runs/run_1/explore_01_initial.png")
        log("   Screenshot saved: explore_01_initial.png")

        # 2. Check page title and visible text
        log(f"   Page title: {page.title()}")
        log(f"   URL: {page.url}")

        # 3. Dump all text on page
        body_text = page.inner_text("body")
        log(f"   Body text (first 2000 chars):\n{body_text[:2000]}")

        # 4. Check for common dialog buttons
        for sel in ['button:has-text("Accept all")', 'button:has-text("Reject all")',
                     'button:has-text("Accept")', 'button:has-text("Got it")',
                     '[role="dialog"] button', 'button:has-text("I agree")',
                     'button:has-text("Sign in")', 'button:has-text("Dismiss")']:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1000):
                    log(f"   Found dialog button: '{sel}', text='{btn.inner_text()}'")
            except:
                pass

        # 5. Find input fields
        inputs = page.locator('input, [role="combobox"], [role="textbox"]')
        count = inputs.count()
        log(f"   Found {count} input/combobox elements")
        for i in range(count):
            el = inputs.nth(i)
            try:
                placeholder = el.get_attribute("placeholder") or ""
                aria_label = el.get_attribute("aria-label") or ""
                log(f"   Input {i}: placeholder='{placeholder}', aria-label='{aria_label}'")
            except:
                pass

        browser.close()
    log("=== EXPLORE COMPLETE ===")

if __name__ == "__main__":
    os.chdir("D:/Projects/Github/claudecode")
    main()
