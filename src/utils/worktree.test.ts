import { describe, test, expect } from 'bun:test'
import { validateWorktreeSlug, worktreeBranchName, flattenSlug } from './worktree.js'

describe('worktree utilities', () => {
  test('validateWorktreeSlug accepts valid slugs', () => {
    expect(() => validateWorktreeSlug('my-feature')).not.toThrow()
    expect(() => validateWorktreeSlug('user/feature')).not.toThrow()
    expect(() => validateWorktreeSlug('test_123')).not.toThrow()
  })

  test('validateWorktreeSlug rejects invalid slugs', () => {
    expect(() => validateWorktreeSlug('../escape')).toThrow()
    expect(() => validateWorktreeSlug('...')).toThrow()
    expect(() => validateWorktreeSlug('')).toThrow()
  })

  test('worktreeBranchName formats correctly', () => {
    expect(worktreeBranchName('my-feature')).toBe('worktree-my-feature')
    expect(worktreeBranchName('user/feature')).toBe('worktree-user+feature')
  })

  test('flattenSlug replaces / with +', () => {
    expect(flattenSlug('user/feature')).toBe('user+feature')
    expect(flattenSlug('a/b/c')).toBe('a+b+c')
  })
})
