import { describe, expect, test } from 'bun:test';
import { escapeXml, escapeXmlAttr } from './xml.js';

describe('xml utilities', () => {
  test('escapeXml escapes ampersand, less-than, greater-than', () => {
    expect(escapeXml('&<>')).toBe('&amp;&lt;&gt;');
  });

  test('escapeXmlAttr also escapes quotes', () => {
    expect(escapeXmlAttr('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&apos;');
  });

  test('escapeXml leaves safe text unchanged', () => {
    expect(escapeXml('hello world')).toBe('hello world');
  });

  test('escapeXmlAttr handles double quotes', () => {
    expect(escapeXmlAttr('test"value')).toBe('test&quot;value');
  });

  test('escapeXmlAttr handles single quotes', () => {
    expect(escapeXmlAttr("test'value")).toBe('test&apos;value');
  });
});
