import * as React from 'react'
import type { LocalJSXCommandCall, LocalJSXCommandContext } from '../../types/command.js'
import { Box, Text } from '../../ink.js'
import { saveGlobalConfig } from '../../utils/config.js'

interface BuddySetupProps {
  onDone: (result?: string, options?: { display?: 'system' | 'user' | 'skip' }) => void
  setAppState: LocalJSXCommandContext['setAppState']
}

function BuddySetup({ onDone, setAppState }: BuddySetupProps): React.ReactNode {
  const [species, setSpecies] = React.useState('duck')
  const [visible, setVisible] = React.useState(true)
  const [animation, setAnimation] = React.useState('idle')

  function handleSave() {
    // Actually save companion to global config
    saveGlobalConfig(current => ({
      ...current,
      companion: {
        name: species,
        personality: `${species} companion`,
        hatchedAt: Date.now(),
        visible,
        animation,
      },
    }))
    // Update AppState to trigger re-render
    setAppState(prev => ({ ...prev, companionVisible: visible }))
    onDone(`Buddy saved: ${species} (visible: ${visible}, animation: ${animation})`)
  }

  React.useEffect(() => {
    handleSave()
  }, [species, visible, animation])

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    React.createElement(Text, { bold: true }, 'Buddy Settings'),
    React.createElement(Text, null, `Species: ${species}`),
    React.createElement(Text, null, `Visible: ${visible ? 'Yes' : 'No'}`),
    React.createElement(Text, { dimColor: true }, 'Use /buddy setup in session to configure'),
  )
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const parts = args.toLowerCase().split(' ')
  const command = parts[0]
  const { setAppState } = _context

  if (command === 'show') {
    saveGlobalConfig(current => ({
      ...current,
      companion: current.companion
        ? { ...current.companion, visible: true }
        : { name: 'duck', personality: 'duck companion', hatchedAt: Date.now(), visible: true, animation: 'idle' },
    }))
    setAppState(prev => ({ ...prev, companionVisible: true }))
    onDone('Buddy is now visible!')
    return null
  }

  if (command === 'hide') {
    saveGlobalConfig(current => ({
      ...current,
      companion: current.companion
        ? { ...current.companion, visible: false }
        : { name: 'duck', personality: 'duck companion', hatchedAt: Date.now(), visible: false, animation: 'idle' },
    }))
    setAppState(prev => ({ ...prev, companionVisible: false }))
    onDone('Buddy is now hidden!')
    return null
  }

  if (command === 'setup' || !command) {
    return React.createElement(BuddySetup, { onDone, setAppState })
  }

  onDone(`Buddy commands: /buddy show, /buddy hide, /buddy setup`)
  return null
}