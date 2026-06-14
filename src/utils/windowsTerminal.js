/**
 * Windows Terminal Capabilities — ConPTY / VT support detection.
 *
 * Detects the Windows console environment and determines what terminal
 * features are available. Used by the Ink renderer and shell providers
 * to adapt output and encoding for the specific Windows terminal.
 */
import { getPlatform } from './platform.js';
let consoleType;
/**
 * Detect the Windows console/terminal type.
 * Only meaningful on Windows; returns 'unknown' on other platforms.
 */
export function getWindowsConsoleType() {
    if (consoleType !== undefined)
        return consoleType;
    if (getPlatform() !== 'windows' && !process.env.WT_SESSION) {
        consoleType = 'unknown';
        return consoleType;
    }
    // Windows Terminal sets WT_SESSION
    if (process.env.WT_SESSION) {
        consoleType = 'windows-terminal';
        return consoleType;
    }
    // mintty (Git Bash / MSYS2 / Cygwin)
    if (process.env.MSYSTEM || process.env.TERM_PROGRAM === 'mintty') {
        consoleType = 'mintty';
        return consoleType;
    }
    // VS Code terminal on Windows (ConPTY-based)
    if (process.env.TERM_PROGRAM === 'vscode') {
        consoleType = 'vscode-terminal';
        return consoleType;
    }
    // ConEmu
    if (process.env.ConEmuANSI || process.env.ConEmuPID || process.env.ConEmuTask) {
        consoleType = 'conemu';
        return consoleType;
    }
    // Detect WSL in Windows Terminal via WSL_DISTRO_NAME
    if (process.env.WSL_DISTRO_NAME && process.env.WT_SESSION) {
        consoleType = 'wsl-terminal';
        return consoleType;
    }
    // Fallback: conhost (legacy cmd/powershell)
    consoleType = 'conhost';
    return consoleType;
}
/**
 * Reset cached console type (for testing).
 */
export function resetWindowsConsoleType() {
    consoleType = undefined;
}
/**
 * Whether the terminal has access to ConPTY (pseudo-console) and thus
 * full ANSI/VT escape sequence support.
 *
 * Windows Terminal, VS Code integrated terminal, and ConEmu with ConPTY
 * all support full VT sequences. Legacy conhost.exe has LIMITED support.
 */
export function hasConPty() {
    const ct = getWindowsConsoleType();
    return (ct === 'windows-terminal' ||
        ct === 'vscode-terminal' ||
        ct === 'conemu' ||
        ct === 'wsl-terminal');
}
/**
 * Whether this is a legacy Windows console (conhost.exe) with limited
 * or no ANSI escape sequence support.
 */
export function isLegacyConsole() {
    return getWindowsConsoleType() === 'conhost';
}
/**
 * Whether the terminal supports ANSI escape sequences (VT100+).
 * ConPTY terminals and modern consoles support them; legacy conhost
 * may not without ENABLE_VIRTUAL_TERMINAL_PROCESSING.
 */
export function supportsAnsiEscapeSequences() {
    if (getPlatform() !== 'windows')
        return true;
    // ConPTY-based terminals always support ANSI
    if (hasConPty())
        return true;
    // mintty supports ANSI
    if (getWindowsConsoleType() === 'mintty')
        return true;
    // Even legacy conhost can support VT if the app sets the mode
    // We check process.stdout.isTTY as a proxy
    return !!process.stdout.isTTY;
}
/**
 * Whether the terminal supports DEC 2026 synchronized output (BSU/ESU).
 */
export function supportsSynchronizedOutput() {
    // Delegates to the existing detection in terminal.ts
    return hasConPty() || getWindowsConsoleType() === 'mintty';
}
/**
 * Whether the terminal supports OSC 9;4 progress reporting.
 */
export function supportsProgressReporting() {
    // Windows Terminal interprets OSC 9;4 as notifications, not progress
    if (process.env.WT_SESSION)
        return false;
    // ConEmu supports it
    if (getWindowsConsoleType() === 'conemu')
        return true;
    // VS Code terminal and mintty do not support it
    return false;
}
/**
 * Detect if running inside Git Bash (MSYS2/MINGW).
 */
export function isGitBash() {
    return (getPlatform() === 'windows' &&
        (!!process.env.MSYSTEM || getWindowsConsoleType() === 'mintty'));
}
