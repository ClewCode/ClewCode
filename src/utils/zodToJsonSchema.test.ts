import { describe, test, expect } from 'bun:test'
import { z } from 'zod/v4'
import { zodToJsonSchema } from './zodToJsonSchema.js'

describe('zodToJsonSchema', () => {
  test('converts simple string schema', () => {
    const schema = z.string()
    const result = zodToJsonSchema(schema)
    expect(result.type).toBe('string')
  })

  test('converts object schema', () => {
    const schema = z.object({ name: z.string(), age: z.number() })
    const result = zodToJsonSchema(schema)
    expect(result.properties).toBeDefined()
    expect(result.properties.name.type).toBe('string')
    expect(result.properties.age.type).toBe('number')
  })

  test('caches results for same schema', () => {
    const schema = z.string()
    const result1 = zodToJsonSchema(schema)
    const result2 = zodToJsonSchema(schema)
    expect(result1).toBe(result2)
  })
})
