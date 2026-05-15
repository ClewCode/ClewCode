import { describe, test, expect } from 'bun:test'
import { isPaneBackend } from './backends/types.js'

describe('backend types', () => {
  test('isPaneBackend returns true for tmux', () => {
    expect(isPaneBackend('tmux')).toBe(true)
  })

  test('isPaneBackend returns true for iterm2', () => {
    expect(isPaneBackend('iterm2')).toBe(true)
  })

  test('isPaneBackend returns false for in-process', () => {
    expect(isPaneBackend('in-process')).toBe(false)
  })
})
