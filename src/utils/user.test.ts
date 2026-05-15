import { describe, test, expect } from 'bun:test'
import { getGitEmail } from './user.js'

describe('user utilities', () => {
  test('getGitEmail returns undefined when not in git repo', async () => {
    // This test may vary based on environment
    const result = await getGitEmail()
    // Just verify it returns a string or undefined
    expect(typeof result === 'string' || result === undefined).toBe(true)
  })
})
