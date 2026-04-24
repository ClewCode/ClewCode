import React from 'react'
import { render, Text } from 'ink'
import { useEffect } from 'react'

const App = () => {
  useEffect(() => {
    console.error('Ink App mounted!')
  }, [])
  return React.createElement(Text, null, 'TEST UI - If you see this, Ink works!')
}

const instance = render(React.createElement(App))
setTimeout(() => {
  console.error('Exiting after 5 seconds...')
  instance.unmount()
  process.exit(0)
}, 5000)
