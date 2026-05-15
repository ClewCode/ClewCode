import { describe, test, expect } from 'bun:test'
import { validateUuid, createAgentId } from './uuid.js'

describe('uuid utilities', () => {
  test('validateUuid accepts valid UUID format', () => {
    expect(validateUuid('550e8400-e29b-41d4-a716-446655440000')).not.toBeNull()
  })

  test('validateUuid rejects invalid format', () => {
    expect(validateUuid('not-a-uuid')).toBeNull()
    expect(validateUuid('')).toBeNull()
    expect(validateUuid(123 as unknown)).toBeNull()
  })

  test('validateUuid rejects malformed UUID', () => {
    expect(validateUuid('550e8400-e29b-41d4-a716-44665544000')).toBeNull()
  })

  test('createAgentId returns string with prefix', () => {
    const id = createAgentId('test')
    expect(id).toMatch(/^atest-[0-9a-f]{16}$/)
  })

  test('createAgentId without label returns basic format', () => {
    const id = createAgentId()
    expect(id).toMatch(/^a[0-9a-f]{16}$/)
  })
})
