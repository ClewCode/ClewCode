import { describe, expect, test } from 'bun:test'
import { decodeHtmlEntities } from './htmlEntities.js'

describe('decodeHtmlEntities', () => {
  test('decodes named entities', () => {
    expect(decodeHtmlEntities('&amp; &lt; &gt;')).toBe('& < >')
  })

  test('decodes numeric decimal entities', () => {
    expect(decodeHtmlEntities('&#65; &#66;')).toBe('AB')
  })

  test('decodes numeric hex entities', () => {
    expect(decodeHtmlEntities('&#x41; &#x42;')).toBe('AB')
  })

  test('handles mixed entities', () => {
    expect(decodeHtmlEntities('&lt;div&gt; &#38; &#x3C;')).toBe('<div> & <')
  })

  test('leaves unknown entities unchanged', () => {
    expect(decodeHtmlEntities('&unknown;')).toBe('&unknown;')
  })

  test('handles empty string', () => {
    expect(decodeHtmlEntities('')).toBe('')
  })

  test('handles string without entities', () => {
    expect(decodeHtmlEntities('hello world')).toBe('hello world')
  })
})
