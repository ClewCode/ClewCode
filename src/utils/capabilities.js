import { logForDiagnosticsNoPII } from './diagLogs.js';
import { execFileNoThrow } from './execFileNoThrow.js';
import { getPlatform } from './platform.js';
import { whichSync } from './which.js';
function exeExists(name) {
    try {
        return Boolean(whichSync(name));
    }
    catch {
        return false;
    }
}
export async function detectCapabilities() {
    const startTime = Date.now();
    logForDiagnosticsNoPII('info', 'capability_detection_started');
    const platform = getPlatform();
    const arch = process.arch;
    // Detect git
    const gitPath = exeExists('git') ? whichSync('git') : undefined;
    const git = {
        available: Boolean(gitPath),
        ...(gitPath && { path: gitPath }),
    };
    // Detect tmux
    const tmux = exeExists('tmux');
    // Detect bun
    let bun = { available: false };
    if (exeExists('bun')) {
        bun = { available: true };
        try {
            const { stdout } = await execFileNoThrow('bun', ['--version']);
            bun.version = stdout.trim();
        }
        catch {
            // Version check failed but bun binary exists
        }
    }
    // Detect node
    const node = {
        available: true,
        version: process.versions?.node,
    };
    try {
        const nodePath = whichSync('node');
        if (nodePath)
            node.path = nodePath;
    }
    catch {
        // node process exists but no CLI in PATH (unlikely)
        node.path = undefined;
    }
    // Detect browser
    let browser = { available: false };
    const browserCandidates = platform === 'windows'
        ? ['chrome', 'chromium', 'msedge', 'google-chrome']
        : ['google-chrome', 'chromium', 'chromium-browser', 'firefox', 'safari'];
    for (const b of browserCandidates) {
        if (exeExists(b)) {
            browser = { available: true, type: b };
            break;
        }
    }
    // On macOS, browsers are typically via `open` not direct CLI, so if platform
    // is macos and no browser CLI found, assume browser is available via system
    if (!browser.available && platform === 'macos') {
        browser = { available: true, type: 'macos_system' };
    }
    // Detect network availability
    let network = { available: false };
    try {
        if (platform === 'windows') {
            const result = await execFileNoThrow('powershell', ['-Command', 'Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet'], { timeout: 3000 });
            // result.stdout is "True\r\n" or "False\r\n"
            const hasNetwork = result.stdout.trim() === 'True';
            network = { available: hasNetwork };
        }
        else {
            const result = await execFileNoThrow('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', 'https://www.google.com', '-m', '3'], { timeout: 3000 });
            network = { available: result.code === 0 && result.stdout?.includes('200') };
        }
    }
    catch {
        try {
            const result2 = await execFileNoThrow('nslookup', ['8.8.8.8'], { timeout: 2000 });
            network = { available: result2.code === 0 };
        }
        catch {
            network = { available: false };
        }
    }
    // Shell detection
    const shell = {
        bash: exeExists('bash'),
        zsh: exeExists('zsh'),
        powershell: exeExists('powershell'),
        cmd: platform === 'windows' ? exeExists('cmd') : false,
    };
    logForDiagnosticsNoPII('info', 'capability_detection_completed', {
        duration_ms: Date.now() - startTime,
        git_available: git.available,
        tmux_available: tmux,
        bun_available: bun.available,
        node_available: node.available,
        browser_available: browser.available,
        network_available: network.available,
    });
    return {
        git,
        tmux,
        bun,
        node,
        browser,
        network,
        os: {
            platform,
            isWindows: platform === 'windows',
            isMacOS: platform === 'macos',
            isLinux: platform === 'linux' || platform === 'wsl',
            arch,
            version: platform === 'windows' ? process.getSystemVersion?.() : undefined,
        },
        shell,
    };
}
export function formatCapabilitiesAsContext(capabilities) {
    const lines = [];
    lines.push('=== System Capabilities ===');
    lines.push('This machine has the following capabilities available:');
    // Git
    const gitInfo = capabilities.git;
    if (typeof gitInfo === 'object' && gitInfo.available) {
        lines.push(`  ✓ git available${gitInfo.path ? ` (${gitInfo.path})` : ''}`);
    }
    else {
        lines.push(`  ✗ git not available`);
    }
    // tmux
    lines.push(`  ${capabilities.tmux ? '✓' : '✗'} tmux ${capabilities.tmux ? '' : '(not available)'}`);
    // bun
    const bunInfo = capabilities.bun;
    if (typeof bunInfo === 'object' && bunInfo.available) {
        lines.push(`  ✓ bun available${bunInfo.version ? ` (${bunInfo.version})` : ''}`);
    }
    else {
        lines.push(`  ✗ bun not available`);
    }
    // node
    const nodeInfo = capabilities.node;
    if (typeof nodeInfo === 'object' && nodeInfo.available) {
        lines.push(`  ✓ node available${nodeInfo.version ? ` (${nodeInfo.version})` : ''}`);
    }
    else {
        lines.push(`  ✗ node not available`);
    }
    // browser
    const browserInfo = capabilities.browser;
    if (typeof browserInfo === 'object' && browserInfo.available) {
        lines.push(`  ✓ browser available${browserInfo.type ? ` (${browserInfo.type})` : ''}`);
    }
    else {
        lines.push(`  ✗ browser not available`);
    }
    // network
    const networkInfo = capabilities.network;
    if (typeof networkInfo === 'object' && networkInfo.available) {
        lines.push(`  ✓ network connectivity available`);
    }
    else {
        lines.push(`  ✗ network connectivity unavailable`);
    }
    // OS info
    lines.push('');
    lines.push(`  OS: ${capabilities.os.platform} (${capabilities.os.arch})${capabilities.os.version ? ` ${capabilities.os.version}` : ''}`);
    lines.push(`  ${capabilities.os.isWindows ? 'Windows' : capabilities.os.isMacOS ? 'macOS' : 'Linux'} ${capabilities.os.isLinux && capabilities.os.platform === 'wsl' ? '(WSL)' : ''}`);
    // Shells
    lines.push('');
    lines.push('Available shells:');
    lines.push(`  ${capabilities.shell.bash ? '✓' : ' '} bash`);
    lines.push(`  ${capabilities.shell.zsh ? '✓' : ' '} zsh`);
    if (capabilities.os.isWindows) {
        lines.push(`  ${capabilities.shell.powershell ? '✓' : ' '} powershell`);
        lines.push(`  ${capabilities.shell.cmd ? '✓' : ' '} cmd`);
    }
    return lines.join('\n');
}
