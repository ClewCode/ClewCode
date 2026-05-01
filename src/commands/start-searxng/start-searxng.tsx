import React, { useState, useEffect } from 'react'
import { exec } from 'child_process'
import { promisify } from 'util'
import { Box, Text, useInput } from '../../ink.js'
import { logEvent } from '../../services/analytics/index.js'
import type { LocalJSXCommandCall } from '../../types/command.js'

const execAsync = promisify(exec)

interface SearxngStatus {
  running: boolean
  containerName: string
  port: number
  url: string
  error?: string
}

const CONTAINER_NAME = 'claude-code-searxng'
const SEARXNG_PORT = 8888
const SEARXNG_IMAGE = 'searxng/searxng:latest'
const SEARXNG_URL = `http://localhost:${SEARXNG_PORT}`

async function checkDockerInstalled(): Promise<boolean> {
  try {
    await execAsync('docker --version')
    return true
  } catch {
    return false
  }
}

async function getSearxngStatus(): Promise<SearxngStatus> {
  const status: SearxngStatus = {
    running: false,
    containerName: CONTAINER_NAME,
    port: SEARXNG_PORT,
    url: SEARXNG_URL,
  }

  try {
    // Check if container exists and is running
    const { stdout } = await execAsync(
      `docker inspect -f '{{.State.Running}}' ${CONTAINER_NAME}`,
    )

    status.running = stdout.trim() === 'true'
  } catch {
    // Container doesn't exist or docker command failed
    status.running = false
  }

  return status
}

async function startSearxng(): Promise<SearxngStatus> {
  const status = await getSearxngStatus()

  if (status.running) {
    return {
      ...status,
      error: 'SearXNG is already running',
    }
  }

  try {
    // Check if Docker is installed
    const dockerInstalled = await checkDockerInstalled()
    if (!dockerInstalled) {
      return {
        ...status,
        error: 'Docker is not installed. Please install Docker first.',
      }
    }

    // Try to start existing container first
    try {
      await execAsync(`docker start ${CONTAINER_NAME}`)
      return {
        ...status,
        running: true,
      }
    } catch {
      // If start failed, check if it exists but is stopped/conflicted
      try {
        await execAsync(`docker rm -f ${CONTAINER_NAME}`)
      } catch {
        // Ignore errors from rm if it truly doesn't exist
      }

      // Now create a new one
      const path = await import('path')
      const settingsPath = path.resolve(process.cwd(), 'searxng-active-config.yml').replace(/\\/g, '/')
      await execAsync(
        `docker run -d --name ${CONTAINER_NAME} -v "${settingsPath}:/etc/searxng/settings.yml" -p ${SEARXNG_PORT}:8080 ${SEARXNG_IMAGE}`,
      )

      return {
        ...status,
        running: true,
      }
    }
  } catch (error) {
    return {
      ...status,
      error: `Failed to start SearXNG: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function stopSearxng(): Promise<SearxngStatus> {
  const status = await getSearxngStatus()

  if (!status.running) {
    return {
      ...status,
      error: 'SearXNG is not running',
    }
  }

  try {
    await execAsync(`docker stop ${CONTAINER_NAME}`)
    return {
      ...status,
      running: false,
    }
  } catch (error) {
    return {
      ...status,
      error: `Failed to stop SearXNG: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function restartSearxng(): Promise<SearxngStatus> {
  try {
    await execAsync(`docker restart ${CONTAINER_NAME}`)
    return {
      running: true,
      containerName: CONTAINER_NAME,
      port: SEARXNG_PORT,
      url: SEARXNG_URL,
    }
  } catch (error) {
    return {
      running: false,
      containerName: CONTAINER_NAME,
      port: SEARXNG_PORT,
      url: SEARXNG_URL,
      error: `Failed to restart SearXNG: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function removeSearxng(): Promise<SearxngStatus> {
  const status = await getSearxngStatus()

  try {
    if (status.running) {
      await execAsync(`docker stop ${CONTAINER_NAME}`)
    }
    await execAsync(`docker rm ${CONTAINER_NAME}`)

    logEvent('searxng_removed', {})

    return {
      running: false,
      containerName: CONTAINER_NAME,
      port: SEARXNG_PORT,
      url: SEARXNG_URL,
    }
  } catch (error) {
    return {
      ...status,
      error: `Failed to remove SearXNG: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function testSearxngConnection(): Promise<boolean> {
  try {
    const url = new URL(`${SEARXNG_URL}/search?q=test&format=json`)
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ClaudeCodeResearchTool/1.0',
        'X-Forwarded-For': '127.0.0.1',
        'X-Real-IP': '127.0.0.1',
      },
      signal: AbortSignal.timeout(5000),
    })
    return response.status === 200
  } catch {
    return false
  }
}

type Action = 'start' | 'stop' | 'restart' | 'remove' | 'test' | 'status'

function SearxngUI({ onDone }: { onDone: () => void }): React.ReactNode {
  const [action, setAction] = useState<Action>('status')
  const [status, setStatus] = useState<SearxngStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const [focusedButton, setFocusedButton] = useState<number>(0)

  const buttons = [
    { label: 'Start', action: 'start' as Action },
    { label: 'Stop', action: 'stop' as Action },
    { label: 'Restart', action: 'restart' as Action },
    { label: 'Remove', action: 'remove' as Action },
    { label: 'Test', action: 'test' as Action },
    { label: 'Exit', action: 'status' as Action },
  ]

  useEffect(() => {
    const performAction = async () => {
      setLoading(true)
      setTestResult(null)

      try {
        let result: SearxngStatus

        switch (action) {
          case 'start':
            result = await startSearxng()
            logEvent('searxng_started', {
              success: !result.error,
            })
            break
          case 'stop':
            result = await stopSearxng()
            logEvent('searxng_stopped', {
              success: !result.error,
            })
            break
          case 'restart':
            result = await restartSearxng()
            logEvent('searxng_restarted', {
              success: !result.error,
            })
            break
          case 'remove':
            result = await removeSearxng()
            break
          case 'test':
            result = await getSearxngStatus()
            if (result.running) {
              const isConnected = await testSearxngConnection()
              setTestResult(isConnected)
              logEvent('searxng_tested', {
                connected: isConnected,
              })
            }
            break
          default:
            result = await getSearxngStatus()
        }

        setStatus(result)
      } finally {
        setLoading(false)
      }
    }

    performAction()
  }, [action])

  useInput((input, key) => {
    if (key.leftArrow || key.rightArrow) {
      if (key.leftArrow) {
        setFocusedButton((prev) => (prev === 0 ? buttons.length - 1 : prev - 1))
      } else {
        setFocusedButton((prev) => (prev === buttons.length - 1 ? 0 : prev + 1))
      }
      return
    }

    if (key.return) {
      const selectedButton = buttons[focusedButton]
      if (selectedButton.action === 'status') {
        onDone()
      }
      setAction(selectedButton.action)
      return
    }

    if (key.escape) {
      onDone()
    }
  })

  if (loading) {
    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Text>Executing action...</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      {/* Status Header */}
      <Box flexDirection="row" gap={2}>
        <Text bold>Status:</Text>
        <Text
          color={status?.running ? 'green' : 'red'}
          bold={status?.running}
        >
          {status?.running ? '✓ Running' : '✗ Stopped'}
        </Text>
      </Box>

      {/* Status Details */}
      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Container: {status?.containerName}</Text>
        <Text dimColor>Port: {status?.port}</Text>
        <Text dimColor>URL: {status?.url}</Text>
      </Box>

      {/* Error Message */}
      {status?.error && (
        <Box flexDirection="column" marginBottom={1} paddingX={1}>
          <Text color="red">Error: {status.error}</Text>
        </Box>
      )}

      {/* Test Result */}
      {testResult !== null && (
        <Box flexDirection="column" marginBottom={1} paddingX={1}>
          <Text color={testResult ? 'green' : 'red'}>
            Connection Test: {testResult ? '✓ Connected' : '✗ Failed'}
          </Text>
        </Box>
      )}

      {/* Buttons */}
      <Box flexDirection="row" gap={1} marginTop={1}>
        {buttons.map((btn, idx) => (
          <Text
            key={btn.action}
            bold={focusedButton === idx}
            color={focusedButton === idx ? 'cyan' : undefined}
            backgroundColor={focusedButton === idx ? 'cyan' : undefined}
            padding={focusedButton === idx ? 1 : 0}
          >
            {btn.label}
          </Text>
        ))}
      </Box>

      {/* Instructions */}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>← → to select • Enter to execute • Esc to exit</Text>
      </Box>

      {/* Setup Info */}
      {!status?.running && (
        <Box flexDirection="column" marginTop={1} paddingX={1}>
          <Text dimColor>First time? Make sure Docker is installed:</Text>
          <Text dimColor>  https://docs.docker.com/get-docker/</Text>
        </Box>
      )}

      {status?.running && (
        <Box flexDirection="column" marginTop={1} paddingX={1}>
          <Text dimColor>SearXNG is ready at: {status.url}</Text>
          <Text dimColor>Use: export SEARXNG_URL={status.url}</Text>
        </Box>
      )}
    </Box>
  )
}

export const call: LocalJSXCommandCall = async (onDone) => {
  return <SearxngUI onDone={onDone} />
}