/**
 * GNU `timeout` flag parsing, shared by the two BashTool modules that need to
 * see through a `timeout ... <command>` wrapper: `bashPermissions.ts` (argv
 * from the AST) and `pathValidation.ts` (raw command text).
 *
 * It lives in its own module because inlining it into `bashToolHasPermission`
 * pushed that function past Bun's feature() dead-code-elimination complexity
 * threshold, which broke `feature('BASH_CLASSIFIER')` evaluation in the
 * classifier tests. Both callers previously kept byte-identical private
 * copies of this security-relevant parser.
 */

/**
 * Values accepted for timeout's flag arguments — durations like `5`, `5s`,
 * `10.5` and signal names like `TERM`/`SIGKILL`/`9`. Deliberately excludes
 * `$ ( ) \` | ; &` and newlines, which an earlier `[^ \t]+` permitted:
 * `timeout -k$(id) 10 ls` must NOT be treated as a strippable wrapper.
 */
const TIMEOUT_FLAG_VALUE_RE = /^[A-Za-z0-9_.+-]+$/;

/**
 * Parse timeout's GNU flags (long + short, fused + space-separated) and
 * return the argv index of the DURATION token, or -1 if flags are unparseable.
 */
export function skipTimeoutFlags(a: readonly string[]): number {
  let i = 1;
  while (i < a.length) {
    const arg = a[i]!;
    const next = a[i + 1];
    if (arg === '--foreground' || arg === '--preserve-status' || arg === '--verbose') i++;
    else if (/^--(?:kill-after|signal)=[A-Za-z0-9_.+-]+$/.test(arg)) i++;
    else if ((arg === '--kill-after' || arg === '--signal') && next && TIMEOUT_FLAG_VALUE_RE.test(next)) i += 2;
    else if (arg === '--') {
      i++;
      break;
    } // end-of-options marker
    else if (arg.startsWith('--')) return -1;
    else if (arg === '-v') i++;
    else if ((arg === '-k' || arg === '-s') && next && TIMEOUT_FLAG_VALUE_RE.test(next)) i += 2;
    else if (/^-[ks][A-Za-z0-9_.+-]+$/.test(arg)) i++;
    else if (arg.startsWith('-')) return -1;
    else break;
  }
  return i;
}
