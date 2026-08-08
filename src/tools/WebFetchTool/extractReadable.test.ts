import { describe, expect, test } from 'bun:test';

const { extractReadableContent } = await import('./utils.js');

describe('extractReadableContent', () => {
  test('extracts the main article and drops navigation/ads/footer', async () => {
    const html = `<!DOCTYPE html>
<html>
<head><title>Test Article</title></head>
<body>
  <nav><a href="/">Home</a> <a href="/about">About</a></nav>
  <aside>Advertisement content here</aside>
  <article>
    <h1>Main Article Title</h1>
    <p>This is the first paragraph of the main article content that should be extracted by Readability.</p>
    <p>This is the second paragraph with more useful information for the reader.</p>
  </article>
  <footer>Copyright 2026</footer>
</body>
</html>`;

    const result = await extractReadableContent(html, 'https://example.com/article');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Test Article');
    expect(result!.content).toContain('Main Article Title');
    expect(result!.content).toContain('first paragraph of the main article');
    // Boilerplate stripped by Readability
    expect(result!.content).not.toContain('Advertisement');
    expect(result!.content).not.toContain('Copyright 2026');
    expect(result!.content).not.toContain('<nav');
  });

  test('returns null for pages with no extractable content', async () => {
    // An empty body has nothing for Readability to extract — parse() returns
    // null, so the caller falls back to the raw HTML.
    const html = `<!DOCTYPE html>
<html>
<head><title>Empty</title></head>
<body>
  <!-- nothing here -->
</body>
</html>`;

    const result = await extractReadableContent(html, 'https://example.com/empty');
    expect(result).toBeNull();
  });

  test('resolves relative URLs for images and links', async () => {
    const html = `<!DOCTYPE html>
<html>
<head><title>Relative Links</title></head>
<body>
  <article>
    <h1>Article</h1>
    <p>See the <a href="/docs/guide">guide</a>, the <a href="page2.html">next page</a>, and this image:
    <img src="/images/hero.png" alt="hero" srcset="/images/hero-2x.png 2x, /images/hero-3x.png 3x"></p>
    <p>More filler text to satisfy the readability threshold and make this a proper article body.</p>
  </article>
</body>
</html>`;

    const result = await extractReadableContent(html, 'https://example.com/docs/start.html');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('href="https://example.com/docs/guide"');
    // Relative file resolves against the directory, not the page URL
    expect(result!.content).toContain('href="https://example.com/docs/page2.html"');
    expect(result!.content).toContain('src="https://example.com/images/hero.png"');
    // srcset candidates are resolved individually
    expect(result!.content).toContain(
      'srcset="https://example.com/images/hero-2x.png 2x, https://example.com/images/hero-3x.png 3x"',
    );
  });

  test('handles unclosed void elements like <img> and <br>', async () => {
    // Real-world HTML frequently omits closing slashes on void elements.
    // linkedom parses these like a browser instead of aborting mid-document.
    const html = `<!DOCTYPE html>
<html>
<head><title>Void Elements</title></head>
<body>
  <article>
    <h1>Article</h1>
    <p>Text before <img src="/photo.png"> text after.</p>
    <p>Line one<br>line two</p>
    <p>More filler text to satisfy the readability threshold and keep the article body.</p>
  </article>
</body>
</html>`;

    const result = await extractReadableContent(html, 'https://example.com/void');
    expect(result).not.toBeNull();
    // Content after the unclosed <img> is preserved (not truncated)
    expect(result!.content).toContain('text after');
    expect(result!.content).toContain('line two');
    expect(result!.content).toContain('src="https://example.com/photo.png"');
  });

  test('does not throw on malformed or partial HTML', async () => {
    const cases = [
      '',
      '<html><body><div>unclosed',
      'not html at all, just plain text',
      '<div><p>bare text no closing tags',
      '<html><head><title>broken<title></head>',
    ];
    for (const html of cases) {
      const result = await extractReadableContent(html, 'https://example.com/broken');
      // Either null (no article) or a string — never a throw.
      expect(result === null || typeof result!.content === 'string').toBe(true);
    }
  });
});
