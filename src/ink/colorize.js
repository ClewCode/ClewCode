import ansis from 'ansis';

/**
 * xterm.js (VS Code, Cursor, code-server, Coder) has supported truecolor
 * since 2017, but code-server/Coder containers often don't set
 * COLORTERM=truecolor. chalk's supports-color doesn't recognize
 * TERM_PROGRAM=vscode (it only knows iTerm.app/Apple_Terminal), so it falls
 * through to the -256color regex → level 2. At level 2, ansis.rgb()
 * downgrades to the nearest 6×6×6 cube color: rgb(215,119,87) (Claude
 * orange) → idx 174 rgb(215,135,135) — washed-out salmon.
 *
 * Gated on level === 2 (not < 3) to respect NO_COLOR / FORCE_COLOR=0 —
 * those yield level 0 and are an explicit "no colors" request. Desktop VS
 * Code sets COLORTERM=truecolor itself, so this is a no-op there (already 3).
 *
 * Must run BEFORE the tmux clamp — if tmux is running inside a VS Code
 * terminal, tmux's passthrough limitation wins and we want level 2.
 */
function boostChalkLevelForXtermJs() {
  if (process.env.TERM_PROGRAM === 'vscode' && ansis.level === 2) {
    ansis.level = 3;
    return true;
  }
  return false;
}
/**
 * tmux parses truecolor SGR (\e[48;2;r;g;bm) into its cell buffer correctly,
 * but its client-side emitter only re-emits truecolor to the outer terminal if
 * the outer terminal advertises Tc/RGB capability (via terminal-overrides).
 * Default tmux config doesn't set this, so tmux emits the cell to iTerm2/etc
 * WITHOUT the bg sequence — outer terminal's buffer has bg=default → black on
 * dark profiles. Clamping to level 2 makes chalk emit 256-color (\e[48;5;Nm),
 * which tmux passes through cleanly. grey93 (255) is visually identical to
 * rgb(240,240,240).
 *
 * Users who HAVE set `terminal-overrides ,*:Tc` get a technically-unnecessary
 * downgrade, but the visual difference is imperceptible. Querying
 * `tmux show -gv terminal-overrides` to detect this would add a subprocess on
 * startup — not worth it.
 *
 * $TMUX is a pty-lifecycle env var set by tmux itself; it never comes from
 * globalSettings.env, so reading it here is correct. chalk is a singleton, so
 * this clamps ALL truecolor output (fg+bg+hex) across the entire app.
 */
function clampChalkLevelForTmux() {
  // bg.ts sets terminal-overrides :Tc before attach, so truecolor passes
  // through — skip the clamp. General escape hatch for anyone who's
  // configured their tmux correctly.
  if (process.env.CLAUDE_CODE_TMUX_TRUECOLOR) return false;
  if (process.env.TMUX && ansis.level > 2) {
    ansis.level = 2;
    return true;
  }
  return false;
}
// Computed once at module load — terminal/tmux environment doesn't change mid-session.
// Order matters: boost first so the tmux clamp can re-clamp if tmux is running
// inside a VS Code terminal. Exported for debugging — tree-shaken if unused.
export const CHALK_BOOSTED_FOR_XTERMJS = boostChalkLevelForXtermJs();
export const CHALK_CLAMPED_FOR_TMUX = clampChalkLevelForTmux();
const RGB_REGEX = /^rgb\(\s?(\d+),\s?(\d+),\s?(\d+)\s?\)$/;
const ANSI_REGEX = /^ansi256\(\s?(\d+)\s?\)$/;
export const colorize = (str, color, type) => {
  if (!color) {
    return str;
  }
  if (color.startsWith('ansi:')) {
    const value = color.substring('ansi:'.length);
    switch (value) {
      case 'black':
        return type === 'foreground' ? ansis.black(str) : ansis.bgBlack(str);
      case 'red':
        return type === 'foreground' ? ansis.red(str) : ansis.bgRed(str);
      case 'green':
        return type === 'foreground' ? ansis.green(str) : ansis.bgGreen(str);
      case 'yellow':
        return type === 'foreground' ? ansis.yellow(str) : ansis.bgYellow(str);
      case 'blue':
        return type === 'foreground' ? ansis.blue(str) : ansis.bgBlue(str);
      case 'magenta':
        return type === 'foreground' ? ansis.magenta(str) : ansis.bgMagenta(str);
      case 'cyan':
        return type === 'foreground' ? ansis.cyan(str) : ansis.bgCyan(str);
      case 'white':
        return type === 'foreground' ? ansis.white(str) : ansis.bgWhite(str);
      case 'blackBright':
        return type === 'foreground' ? ansis.blackBright(str) : ansis.bgBlackBright(str);
      case 'redBright':
        return type === 'foreground' ? ansis.redBright(str) : ansis.bgRedBright(str);
      case 'greenBright':
        return type === 'foreground' ? ansis.greenBright(str) : ansis.bgGreenBright(str);
      case 'yellowBright':
        return type === 'foreground' ? ansis.yellowBright(str) : ansis.bgYellowBright(str);
      case 'blueBright':
        return type === 'foreground' ? ansis.blueBright(str) : ansis.bgBlueBright(str);
      case 'magentaBright':
        return type === 'foreground' ? ansis.magentaBright(str) : ansis.bgMagentaBright(str);
      case 'cyanBright':
        return type === 'foreground' ? ansis.cyanBright(str) : ansis.bgCyanBright(str);
      case 'whiteBright':
        return type === 'foreground' ? ansis.whiteBright(str) : ansis.bgWhiteBright(str);
    }
  }
  if (color.startsWith('#')) {
    return type === 'foreground' ? ansis.hex(color)(str) : ansis.bgHex(color)(str);
  }
  if (color.startsWith('ansi256')) {
    const matches = ANSI_REGEX.exec(color);
    if (!matches) {
      return str;
    }
    const value = Number(matches[1]);
    return type === 'foreground' ? ansis.ansi256(value)(str) : ansis.bgAnsi256(value)(str);
  }
  if (color.startsWith('rgb')) {
    const matches = RGB_REGEX.exec(color);
    if (!matches) {
      return str;
    }
    const firstValue = Number(matches[1]);
    const secondValue = Number(matches[2]);
    const thirdValue = Number(matches[3]);
    return type === 'foreground'
      ? ansis.rgb(firstValue, secondValue, thirdValue)(str)
      : ansis.bgRgb(firstValue, secondValue, thirdValue)(str);
  }
  return str;
};
/**
 * Apply TextStyles to a string using ansis.
 * This is the inverse of parsing ANSI codes - we generate them from structured styles.
 * Theme resolution happens at component layer, not here.
 */
export function applyTextStyles(text, styles) {
  let result = text;
  // Apply styles in reverse order of desired nesting.
  // chalk wraps text so later calls become outer wrappers.
  // Desired order (outermost to innermost):
  //   background > foreground > text modifiers
  // So we apply: text modifiers first, then foreground, then background last.
  if (styles.inverse) {
    result = ansis.inverse(result);
  }
  if (styles.strikethrough) {
    result = ansis.strikethrough(result);
  }
  if (styles.underline) {
    result = ansis.underline(result);
  }
  if (styles.italic) {
    result = ansis.italic(result);
  }
  if (styles.bold) {
    result = ansis.bold(result);
  }
  if (styles.dim) {
    result = ansis.dim(result);
  }
  if (styles.color) {
    // Color is now always a raw color value (theme resolution happens at component layer)
    result = colorize(result, styles.color, 'foreground');
  }
  if (styles.backgroundColor) {
    // backgroundColor is now always a raw color value
    result = colorize(result, styles.backgroundColor, 'background');
  }
  return result;
}
/**
 * Apply a raw color value to text.
 * Theme resolution should happen at component layer, not here.
 */
export function applyColor(text, color) {
  if (!color) {
    return text;
  }
  return colorize(text, color, 'foreground');
}
