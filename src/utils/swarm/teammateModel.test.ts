import { describe, test, expect } from 'bun:test'
import { getHardcodedTeammateModelFallback } from './teammateModel.js'

describe('teammateModel', () => {
  test('getHardcodedTeammateModelFallback returns a string', () => {
    const model = getHardcodedTeammateModelFallback()
    expect(typeof model).toBe('string')
    expect(model.length).toBeGreaterThan(0)
  })
})
