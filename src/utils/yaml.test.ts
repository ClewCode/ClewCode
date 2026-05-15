import { describe, test, expect } from 'bun:test'
import { parseYaml } from './yaml.js'

describe('yaml parser', () => {
  test('parses simple key-value pair', () => {
    const result = parseYaml('foo: bar')
    expect(result).toEqual({ foo: 'bar' })
  })

  test('parses nested object', () => {
    const result = parseYaml('user:\n  name: Alice\n  age: 30')
    expect(result).toEqual({ user: { name: 'Alice', age: 30 } })
  })

  test('parses array', () => {
    const result = parseYaml('[1, 2, 3]')
    expect(result).toEqual([1, 2, 3])
  })

  test('parses boolean and null', () => {
    const result = parseYaml('enabled: true\nvalue: null')
    expect(result).toEqual({ enabled: true, value: null })
  })
})
