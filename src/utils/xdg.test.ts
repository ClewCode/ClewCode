import { describe, test, expect } from 'bun:test'
import { getXDGStateHome, getXDGCacheHome, getXDGDataHome, getUserBinDir } from './xdg.js'

describe('xdg utilities', () => {
  test('getXDGStateHome uses XDG_STATE_HOME if set', () => {
    const result = getXDGStateHome({ env: { XDG_STATE_HOME: '/custom/state' } })
    expect(result).toBe('/custom/state')
  })

  test('getXDGStateHome falls back to ~/.local/state', () => {
    const result = getXDGStateHome({ env: {} })
    expect(result).toContain('.local/state')
  })

  test('getXDGCacheHome uses XDG_CACHE_HOME if set', () => {
    const result = getXDGCacheHome({ env: { XDG_CACHE_HOME: '/custom/cache' } })
    expect(result).toBe('/custom/cache')
  })

  test('getXDGCacheHome falls back to ~/.cache', () => {
    const result = getXDGCacheHome({ env: {} })
    expect(result).toContain('.cache')
  })

  test('getXDGDataHome uses XDG_DATA_HOME if set', () => {
    const result = getXDGDataHome({ env: { XDG_DATA_HOME: '/custom/data' } })
    expect(result).toBe('/custom/data')
  })

  test('getUserBinDir returns ~/.local/bin', () => {
    const result = getUserBinDir({ env: {} })
    expect(result).toContain('.local/bin')
  })
})
