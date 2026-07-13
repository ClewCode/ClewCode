import figures from 'figures';
import type * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Divider } from '../../components/design-system/Divider.js';
import { Pane } from '../../components/design-system/Pane.js';
import ThemedBox from '../../components/design-system/ThemedBox.js';
import { Spinner } from '../../components/Spinner.js';
import { Box, Text, useInput, useTheme } from '../../ink.js';
import { generateAwaySummary } from '../../services/awaySummary.js';
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js';
import type { Message } from '../../types/message.js';
import { execFileNoThrowWithCwd } from '../../utils/execFileNoThrow.js';
import { extractTextContent } from '../../utils/messages.js';
import { getPlatform } from '../../utils/platform.js';

// Copy utility for plain text
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const platform = getPlatform();
  if (platform === 'macos') {
    const res = await execFileNoThrowWithCwd('pbcopy', [], { input: text });
    return res.code === 0;
  }
  if (platform === 'linux') {
    const res1 = await execFileNoThrowWithCwd('xclip', ['-selection', 'clipboard'], { input: text });
    if (res1.code === 0) return true;
    const res2 = await execFileNoThrowWithCwd('xsel', ['--clipboard', '--input'], { input: text });
    return res2.code === 0;
  }
  if (platform === 'windows') {
    const res = await execFileNoThrowWithCwd('clip', [], { input: text });
    return res.code === 0;
  }
  return false;
}

type Props = {
  onDone: LocalJSXCommandOnDone;
  context: any;
};

function RecapDashboard({ onDone, context }: Props): React.ReactNode {
  const [_themeName] = useTheme();
  const [loading, setLoading] = useState(true);
  // AI-synthesized summary. null = not (yet) available; we always fall back to
  // a locally-computed summary so the dashboard never dead-ends on a failed
  // or slow model call.
  const [aiText, setAiText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const messages = context.messages as Message[];

  // Calculate session active duration dynamically
  const durationStr = useMemo(() => {
    const timestamps = messages
      .map(m => m.timestamp)
      .filter((t): t is string => typeof t === 'string' && !Number.isNaN(Date.parse(t)));

    if (timestamps.length === 0) return 'Just started';

    const start = new Date(timestamps[0]!);
    const end = new Date(timestamps[timestamps.length - 1]!);
    const diffMs = Math.max(0, end.getTime() - start.getTime());
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) {
      const diffSecs = Math.floor(diffMs / 1000);
      return `${diffSecs} second${diffSecs === 1 ? '' : 's'}`;
    }
    if (diffMins < 60) {
      return `${diffMins} minute${diffMins === 1 ? '' : 's'}`;
    }
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours} hour${hours === 1 ? '' : 's'} ${mins} minute${mins === 1 ? '' : 's'}`;
  }, [messages]);

  // Count user turns and tool executions
  const { userTurnsCount, toolExecutions } = useMemo(() => {
    const userTurns = messages.filter((m: Message) => m.type === 'user' && !m.isMeta && !m.isCompactSummary);
    let toolsCount = 0;
    for (const msg of messages) {
      if (msg.type === 'user' && Array.isArray(msg.message?.content)) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_result') {
            toolsCount++;
          }
        }
      }
    }
    return {
      userTurnsCount: userTurns.length,
      toolExecutions: toolsCount,
    };
  }, [messages]);

  // Extract recent user intents (last 3 human turns)
  const recentIntents = useMemo(() => {
    const userTurns = messages.filter((m: Message) => m.type === 'user' && !m.isMeta && !m.isCompactSummary);
    return userTurns
      .slice(-3)
      .map((m: Message) => {
        const rawText =
          typeof m.message.content === 'string'
            ? m.message.content
            : Array.isArray(m.message.content)
              ? extractTextContent(m.message.content)
              : '';
        const cleanText = rawText.trim().replace(/\s+/g, ' ');
        return cleanText.length > 60 ? `${cleanText.slice(0, 57)}...` : cleanText;
      })
      .filter(t => t.length > 0);
  }, [messages]);

  // Locally-computed summary — always available, no model call. Used as the
  // fallback when the AI synthesis fails (offline, provider error, flaky free
  // model) so the recap is never empty and never prints "undefined".
  const localSummary = useMemo(() => {
    const latest = recentIntents[recentIntents.length - 1];
    if (latest) {
      return `Goal: ${latest} Next: continue from where this left off.`;
    }
    return `Session with ${userTurnsCount} exchange${userTurnsCount === 1 ? '' : 's'} and ${toolExecutions} tool call${toolExecutions === 1 ? '' : 's'} so far.`;
  }, [recentIntents, userTurnsCount, toolExecutions]);

  // Whatever we display and hand back on exit — AI synthesis when available,
  // otherwise the local summary. Guaranteed non-empty.
  const displayText = aiText ?? localSummary;

  // Best-effort AI synthesis. Failure is expected and non-fatal: we keep the
  // locally-computed summary and just stop the spinner.
  useEffect(() => {
    const controller = new AbortController();
    let isCancelled = false;

    async function loadSummary() {
      try {
        const text = await generateAwaySummary(messages, controller.signal);
        if (!isCancelled && text) {
          setAiText(text);
        }
      } catch {
        /* keep local fallback */
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadSummary();
    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [messages]);

  // Copy plain text recap
  const handleCopy = useCallback(async () => {
    const plainSummary = `SESSION RECAP\n==============\nActive Turns: ${userTurnsCount} exchanges\nDuration: ${durationStr}\nTool Calls: ${toolExecutions} calls\n\nSummary:\n${displayText}`;
    const success = await copyTextToClipboard(plainSummary);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [displayText, userTurnsCount, durationStr, toolExecutions]);

  // Handle keyboard inputs
  useInput((input, key) => {
    if (key.escape || input === 'q' || key.return) {
      // Always hand back a non-empty summary — never `undefined`, which would
      // render literally as "undefined" in the transcript.
      onDone(displayText, { display: 'system' });
    } else if (input === 'c') {
      void handleCopy();
    }
  });

  if (loading) {
    return (
      <Pane color="claude">
        <Box flexDirection="column" paddingY={1} gap={1}>
          <Box flexDirection="row" gap={1}>
            <Spinner color="autoAccept" />
            <Text bold color="autoAccept">
              {' '}
              Analyzing session transcript...
            </Text>
          </Box>
          <Text dimColor>Synthesizing key achievements and outlining next steps...</Text>
        </Box>
      </Pane>
    );
  }

  return (
    <Pane color="claude">
      {/* Title Divider */}
      <Divider title=" ✦  SESSION RECAP  ✦ " color="claude" />

      {/* Main Container */}
      <Box flexDirection="column" marginTop={1} gap={1}>
        {/* Statistics & Metadata Row */}
        <Box flexDirection="row" gap={4}>
          <Box flexDirection="column">
            <Text bold color="claude">
              SESSION METRICS
            </Text>
            <Box flexDirection="row" gap={1}>
              <Text dimColor>{figures.bullet} Active Turns:</Text>
              <Text bold>{userTurnsCount} exchanges</Text>
            </Box>
            <Box flexDirection="row" gap={1}>
              <Text dimColor>{figures.bullet} Duration:</Text>
              <Text bold>{durationStr}</Text>
            </Box>
            <Box flexDirection="row" gap={1}>
              <Text dimColor>{figures.bullet} Operations:</Text>
              <Text bold>{toolExecutions} tool calls</Text>
            </Box>
          </Box>

          {/* Timeline of User Intents */}
          {recentIntents.length > 0 && (
            <Box flexDirection="column" flexGrow={1}>
              <Text bold color="suggestion">
                RECENT INTENTS
              </Text>
              {recentIntents.map(intent => (
                <Text key={intent} wrap="truncate-end" dimColor>
                  {figures.pointerSmall} {intent}
                </Text>
              ))}
            </Box>
          )}
        </Box>

        {/* Synthesis Card Section */}
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="claude">
            SUMMARY SYNTHESIS
          </Text>
          <ThemedBox
            borderStyle="round"
            borderColor="claude"
            paddingX={2}
            paddingY={1}
            flexDirection="column"
            width="100%"
          >
            <Text wrap="wrap" color="text">
              {displayText}
            </Text>
            {aiText === null && (
              <Text dimColor>{figures.pointerSmall} AI synthesis unavailable — showing local summary.</Text>
            )}
          </ThemedBox>
        </Box>

        {/* Footer with keybindings */}
        <Box paddingLeft={1} marginTop={1} flexDirection="row" justifyContent="space-between">
          <Text dimColor>
            Press{' '}
            <Text bold color="text">
              Esc
            </Text>{' '}
            or{' '}
            <Text bold color="text">
              q
            </Text>{' '}
            to exit
            {copied ? (
              <Text color="success"> · {figures.tick} Copied recap to clipboard!</Text>
            ) : (
              <Text>
                {' '}
                · Press{' '}
                <Text bold color="text">
                  c
                </Text>{' '}
                to copy recap
              </Text>
            )}
          </Text>
        </Box>
      </Box>
    </Pane>
  );
}

export const call: LocalJSXCommandCall = async (onDone, context) => {
  // Check user turns first
  const userTurns = context.messages.filter((m: Message) => m.type === 'user' && !m.isMeta && !m.isCompactSummary);
  if (userTurns.length < 1) {
    onDone('Nothing to recap yet — start a conversation first.', { display: 'system' });
    return null;
  }

  return <RecapDashboard onDone={onDone} context={context} />;
};
