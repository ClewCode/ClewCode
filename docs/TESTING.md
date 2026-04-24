# Testing Guide

This guide covers testing practices for Claude Code.

## Test Runner

Claude Code uses **Bun's built-in test runner**.

```bash
# Run all tests
bun test

# Run specific test file
bun test test/utils/messages.test.ts

# Watch mode (re-run on changes)
bun test --watch

# Coverage
bun test --coverage
```

## Test Files

Place tests in `test/` or alongside source with `.test.ts` suffix:

```
src/
  utils/
    messages.ts
    messages.test.ts   ← same directory
```

Or central test directory:
```
test/
  unit/
    messages.test.ts
  integration/
    cli.test.ts
```

## Writing Tests

### Basic Structure

```typescript
import { describe, expect, test, beforeEach, beforeAll } from 'bun:test'
import { createAssistantMessage } from 'src/utils/messages'

describe('createAssistantMessage', () => {
  test('creates message with text content', () => {
    const msg = createAssistantMessage({
      content: 'Hello world',
      usage: { input_tokens: 10, output_tokens: 5 }
    })

    expect(msg.message.content[0]).toEqual({
      type: 'text',
      text: 'Hello world'
    })
    expect(msg.usage.output_tokens).toBe(5)
  })

  test('throws on invalid content', () => {
    expect(() => {
      createAssistantMessage({ content: null as any })
    }).toThrow()
  })
})
```

### Async Tests

```typescript
test('fetches data from API', async () => {
  const result = await fetchSomething()
  expect(result).toBeDefined()
  expect(result.status).toBe(200)
})
```

### Mocking

Use Bun's built-in mocking or `jest-mock`-style:

```typescript
import { mock, expectCall } from 'bun:test'

test('calls provider with correct args', async () => {
  const fetchMock = mock(() => Promise.resolve({ ok: true, json: () => ({}) }))

  await myFunction()

  expectCall(fetchMock, 1).toHaveBeenCalledWith(
    expect.stringContaining('api.example.com')
  )
})
```

For complex mocking, use `sinon` or `jest-mock-extended`.

### Fixtures

Place test fixtures in `test/fixtures/`:

```typescript
const sampleResponse = await readFile('./test/fixtures/sample-response.json')
```

## Test Categories

### Unit Tests

Test pure functions, utilities, small modules in isolation.

Location: `test/unit/` or alongside source.

```typescript
describe('parseMessage', () => {
  test('parses user message', () => {
    // ...
  })
})
```

### Integration Tests

Test component interactions, full command execution, API flows.

Location: `test/integration/`.

```typescript
describe('CLI command: /cost', () => {
  test('displays session cost', async () => {
    const { stdout } = await run(['node', 'dist/main.js', '-p', '/cost'])
    expect(stdout).toContain('$0.00')
  })
})
```

### Provider Tests

For Claude integration (mocked, no actual API calls):

```typescript
describe('ClaudeService', () => {
  let service: ClaudeService

  beforeEach(() => {
    service = new ClaudeService()
    service.initialize({ apiKey: 'test-key' })
  })

  test('getAvailableModels returns list', () => {
    expect(service.getAvailableModels()).toContain('claude-3-5-sonnet-20241022')
  })
})
```

For live API tests (slow, costly), mark with `.skip` or separate CI job.

### UI/Component Tests

CLI UI is Ink (React). Test with `@testing-library/react`:

```bash
bun add -d @testing-library/react @testing-library/jest-dom jest-environment-jsdom
```

```typescript
import { render, screen } from '@testing-library/react'
import { App } from 'src/App'

test('renders prompt', () => {
  render(<App />)
  expect(screen.getByPlaceholderText(/type your message/i)).toBeInTheDocument()
})
```

## Best Practices

1. **Arrange-Act-Assert** — Structure tests clearly
2. **Single responsibility** — One behavior per test
3. **Descriptive names** — `should do X when Y`
4. **Avoid implementation details** — Test behavior, not internals
5. **Setup/Teardown** — Use `beforeEach`, `afterEach` to isolate tests
6. **Avoid flakiness** — No reliance on timing, randomness, or network

Example:
```typescript
describe('TaskTool', () => {
  let tool: TaskTool

  beforeEach(() => {
    tool = new TaskTool()
    tool.initialize()
  })

  afterEach(() => {
    tool.cleanup()
  })

  test('should spawn sub-agents in parallel', async () => {
    const result = await tool.execute({ description: 'Do things' })
    expect(result.tasks).toHaveLength(3)
  })
})
```

## Mocking External Services

Never hit real APIs in unit tests. Mock:

- AI SDK: Mock `generateText`, `streamText`
- File system: Use `memfs` or Bun's in-memory fs
- Network: `mock.fetch` or `sinon.stub`
- Environment: Set `process.env` in before hook

Example:
```typescript
const originalEnv = process.env

beforeEach(() => {
  process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key' }
})

afterEach(() => {
  process.env = originalEnv
})
```

## Coverage

```bash
# Generate coverage report
bun test --coverage

# Output in ./coverage/
# HTML report: coverage/index.html
```

Aim for:
- Core utilities: >80%
- Provider implementations: >70%
- CLI commands: >60%
- UI components: >50%

New code should meet minimums.

## Continuous Integration

GitHub Actions workflow (example `.github/workflows/test.yml`):

```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test --coverage
      - uses: codecov/codecov-action@v3
```

## Debugging Tests

```bash
# Run single test with debug logs
DEBUG=1 bun test test/my.test.ts

# Use console.log (captured by Bun)
test('...', () => {
  console.log('debug:', value)
})

# Breakpoint with debugger statement
test('...', () => {
  debugger // Bun test pauses here with --inspect
  // ...
})
```

## E2E Testing (Optional)

Use Playwright for full CLI integration:

```bash
bun add -d @playwright/test
```

```typescript
import { test, expect, spawn } from '@playwright/test'

test('runs /cost command', async () => {
  const proc = spawn('node', ['dist/main.js', '-p', '/cost'])
  await proc.stdout.event('data', (chunk) => {
    expect(chunk.toString()).toContain('$')
  })
})
```

## Common Pitfalls

- **Async not awaited** → False positives
- **Shared mutable state** → Flaky tests
- **Hardcoded paths** → Use `tmp` dir for file tests
- **External network calls** → Always mock
- **Timing assumptions** → Use fake timers if needed

## Resources

- [Bun Test Docs](https://bun.sh/docs/test)
- [Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Zod testing utilities](https://zod.dev/?id=testing)
