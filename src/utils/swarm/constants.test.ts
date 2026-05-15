import { describe, test, expect } from 'bun:test'
import { TEAM_LEAD_NAME, SWARM_SESSION_NAME, TMUX_COMMAND, getSwarmSocketName } from './constants.js'

describe('swarm constants', () => {
  test('TEAM_LEAD_NAME is team-lead', () => {
    expect(TEAM_LEAD_NAME).toBe('team-lead')
  })

  test('SWARM_SESSION_NAME is claude-swarm', () => {
    expect(SWARM_SESSION_NAME).toBe('claude-swarm')
  })

  test('TMUX_COMMAND is tmux', () => {
    expect(TMUX_COMMAND).toBe('tmux')
  })

  test('getSwarmSocketName includes PID', () => {
    const socketName = getSwarmSocketName()
    expect(socketName).toMatch(/claude-swarm-\d+/)
  })
})
