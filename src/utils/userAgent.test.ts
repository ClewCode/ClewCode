import { describe, test, expect } from 'bun:test'
import { getClaudeCodeUserAgent } from './userAgent.js'

describe('userAgent', () => {
  test('getClaudeCodeUserAgent returns string with claude-code prefix', () => {
    const agent = getClaudeCodeUserAgent()
    expect(agent).toMatch(/^claude-code\//)
  })
})
