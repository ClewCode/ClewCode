import React from 'react'
import { render } from 'ink'
import { Text } from 'ink'

const App = () => React.createElement(Text, null, 'Hello from Ink!')

const { waitUntilExit } = render(React.createElement(App))
waitUntilExit()
