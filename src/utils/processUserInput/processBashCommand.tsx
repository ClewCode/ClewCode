import type { ContentBlockParam } from '@anthropic-ai/sdk/resources';
import { randomUUID } from 'crypto';
import type * as React from 'react';
import { BashModeProgress } from 'src/components/BashModeProgress.js';
import type { SetToolJSXFn } from 'src/Tool.js';
import { BashTool } from 'src/tools/BashTool/BashTool.js';
import type { AttachmentMessage, SystemMessage, UserMessage } from 'src/types/message.js';
// @ts-expect-error - Phase3 typecheck auto (TS error suppression)
import type { ShellProgress } from 'src/types/tools.js';
import { logEvent } from '../../services/analytics/index.js';
import { errorMessage, ShellError } from '../errors.js';
import {
  createSyntheticUserCaveatMessage,
  createUserInterruptionMessage,
  createUserMessage,
  prepareUserContent,
} from '../messages.js';
import { resolveDefaultShell } from '../shell/resolveDefaultShell.js';
import { isPowerShellToolEnabled } from '../shell/shellToolUtils.js';
import { processToolResultBlock } from '../toolResultStorage.js';
import { escapeXml } from '../xml.js';
import type { ProcessUserInputContext } from './processUserInput.js';
export async function processBashCommand(
  inputString: string,
  precedingInputBlocks: ContentBlockParam[],
  attachmentMessages: AttachmentMessage[],
  context: ProcessUserInputContext,
  setToolJSX: SetToolJSXFn,
  runInBackground?: boolean,
): Promise<{
  messages: (UserMessage | AttachmentMessage | SystemMessage)[];
  shouldQuery: boolean;
}> {
  // Shell routing (docs/design/ps-shell-selection.md §5.2): consult
  // defaultShell, fall back to bash. isPowerShellToolEnabled() applies the
  // same platform + env-var gate as tools.ts so input-box routing matches
  // tool-list visibility. Computed up front so telemetry records the
  // actual shell, not the raw setting.
  const usePowerShell = isPowerShellToolEnabled() && resolveDefaultShell() === 'powershell';
  logEvent('tengu_input_bash', {
    powershell: usePowerShell,
  });
  const userMessage = createUserMessage({
    content: prepareUserContent({
      inputString: `<bash-input>${inputString}</bash-input>`,
      precedingInputBlocks,
    }),
  });

  // ctrl+b to background indicator.
  // NOTE: do NOT name this `jsx` — that shadows the automatic JSX-runtime
  // factory (jsxImportSource "react"), so every <Component/> in this scope
  // compiles to a call on this undefined local instead of the runtime.
  let capturedJsx: React.ReactNode;

  // Just show initial UI
  setToolJSX({
    jsx: <BashModeProgress input={inputString} progress={null} verbose={context.options.verbose} />,
    shouldHidePromptInput: false,
  });
  try {
    const bashModeContext: ProcessUserInputContext = {
      ...context,
      // TODO: Clean up this hack
      setToolJSX: _ => {
        capturedJsx = _?.jsx;
      },
    };

    // Progress UI — shared across both shell backends (both emit ShellProgress)
    const onProgress = (progress: { data: ShellProgress }) => {
      setToolJSX({
        jsx: (
          <>
            <BashModeProgress input={inputString!} progress={progress.data} verbose={context.options.verbose} />
            {capturedJsx}
          </>
        ),
        shouldHidePromptInput: false,
        showSpinner: false,
      });
    };

    // User-initiated `!` commands run outside sandbox. Both shell tools honor
    // dangerouslyDisableSandbox (checked against areUnsandboxedCommandsAllowed()
    // in shouldUseSandbox.ts). PS sandbox is Linux/macOS/WSL2 only — on Windows
    // native, shouldUseSandbox() returns false regardless (unsupported platform).
    // Lazy-require PowerShellTool so its ~300KB chunk only loads when the
    // user has actually selected the powershell default shell.
    type PSMod = typeof import('src/tools/PowerShellTool/PowerShellTool.js');
    let PowerShellTool: PSMod['PowerShellTool'] | null = null;
    if (usePowerShell) {
      /* eslint-disable @typescript-eslint/no-require-imports */
      PowerShellTool = (require('src/tools/PowerShellTool/PowerShellTool.js') as PSMod).PowerShellTool;
      /* eslint-enable @typescript-eslint/no-require-imports */
    }
    const shellTool = PowerShellTool ?? BashTool;
    const response = PowerShellTool
      ? await PowerShellTool.call(
          {
            command: inputString,
            dangerouslyDisableSandbox: true,
            ...(runInBackground && { run_in_background: true }),
          },
          bashModeContext,
          undefined,
          undefined,
          onProgress,
        )
      : await BashTool.call(
          {
            command: inputString,
            dangerouslyDisableSandbox: true,
            ...(runInBackground && { run_in_background: true }),
          },
          bashModeContext,
          undefined,
          undefined,
          onProgress,
        );
    const data = response.data;
    if (!data) {
      throw new Error('No result received from shell command');
    }
    const stderr = data.stderr;
    // Reuse the same formatting pipeline as inline !`cmd` bash (promptShellExecution)
    // and model-initiated Bash. When BashTool.call() persists large output to disk,
    // data.persistedOutputPath is set and the formatter wraps in <persisted-output>.
    // Pass stderr:'' to keep it separate for the <bash-stderr> UI tag.
    const mapped = await processToolResultBlock(
      shellTool,
      {
        ...data,
        stderr: '',
      },
      randomUUID(),
    );
    // mapped.content may contain our own <persisted-output> wrapper (trusted
    // XML from buildLargeToolResultMessage). Escaping it would turn structural
    // tags into &lt;persisted-output&gt;, breaking the model's parse and
    // UserBashOutputMessage's extractTag. Escape the raw fallback only.
    const stdout = typeof mapped.content === 'string' ? mapped.content : escapeXml(data.stdout);
    return {
      messages: [
        createSyntheticUserCaveatMessage(),
        userMessage,
        ...attachmentMessages,
        createUserMessage({
          content: `<bash-stdout>${stdout}</bash-stdout><bash-stderr>${escapeXml(stderr)}</bash-stderr>`,
        }),
      ],
      shouldQuery: false,
    };
  } catch (e) {
    if (e instanceof ShellError) {
      if (e.interrupted) {
        return {
          messages: [
            createSyntheticUserCaveatMessage(),
            userMessage,
            createUserInterruptionMessage({
              toolUse: false,
            }),
            ...attachmentMessages,
          ],
          shouldQuery: false,
        };
      }
      return {
        messages: [
          createSyntheticUserCaveatMessage(),
          userMessage,
          ...attachmentMessages,
          createUserMessage({
            content: `<bash-stdout>${escapeXml(e.stdout)}</bash-stdout><bash-stderr>${escapeXml(e.stderr)}</bash-stderr>`,
          }),
        ],
        shouldQuery: false,
      };
    }
    return {
      messages: [
        createSyntheticUserCaveatMessage(),
        userMessage,
        ...attachmentMessages,
        createUserMessage({
          content: `<bash-stderr>Command failed: ${escapeXml(errorMessage(e))}</bash-stderr>`,
        }),
      ],
      shouldQuery: false,
    };
  } finally {
    setToolJSX(null);
  }
}
