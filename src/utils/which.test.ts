import { describe, test, expect } from 'bun:test'
import { which, whichSync } from './which.js'

describe('which utility', () => {
  test('which returns null for non-existent command', async () => {
    const result = await which('nonexistent-command-12345')
    expect(result).toBeNull()
  })

  test('whichSync returns null for non-existent command', () => {
    const result = whichSync('nonexistent-command-12345')
    expect(result).toBeNull()
  })
})
