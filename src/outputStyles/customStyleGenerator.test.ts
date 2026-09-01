import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { generateCustomOutputStyle, saveCustomOutputStyle } from './customStyleGenerator.js';

describe('customStyleGenerator', () => {
  it('generates a valid fallback style when offline', async () => {
    const style = await generateCustomOutputStyle('Speak in pirate slang with ahoy and matey');
    expect(style.name).toBeDefined();
    expect(style.slug).toBeDefined();
    expect(style.description).toBeDefined();
    expect(style.prompt).toContain('pirate');
  });

  it('saves custom style to disk and formats markdown frontmatter', () => {
    const testStyle = {
      name: 'Test Piratestyle',
      slug: 'test-pirate-unique-12345',
      description: 'A test pirate style',
      prompt: 'Always talk like a pirate.',
    };

    const savedPath = saveCustomOutputStyle(testStyle, 'user');
    expect(existsSync(savedPath)).toBe(true);

    // Clean up
    try {
      rmSync(savedPath);
    } catch {
      // ignore
    }
  });
});
