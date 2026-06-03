#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

function resolveWindowsBunShim(candidate) {
  const candidateDir = path.dirname(candidate);
  const npmBunExe = path.join(candidateDir, 'node_modules', 'bun', 'bin', 'bun.exe');

  if (existsSync(npmBunExe)) {
    return npmBunExe;
  }

  return null;
}

function resolveBunCommand() {
  const whichCommand = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(whichCommand, ['bun'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: false,
  });

  if (result.status !== 0 || !result.stdout) {
    return null;
  }

  const candidates = result.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (process.platform === 'win32') {
    const exeCandidate = candidates.find(candidate => candidate.toLowerCase().endsWith('.exe'));
    if (exeCandidate) {
      return exeCandidate;
    }

    for (const candidate of candidates) {
      const shimTarget = resolveWindowsBunShim(candidate);
      if (shimTarget) {
        return shimTarget;
      }
    }

    return candidates.find(candidate => candidate.toLowerCase().endsWith('.cmd')) || candidates[0];
  }

  return candidates[0];
}

function printBunInstallHelp() {
  const installCommand =
    process.platform === 'win32'
      ? 'powershell -c "irm bun.sh/install.ps1 | iex"'
      : 'curl -fsSL https://bun.sh/install | bash';

  console.error('Clew requires Bun at runtime.');
  console.error('This npm package installs the launcher, but the CLI itself runs with Bun.');
  console.error('');
  console.error('Install Bun, then run `clew` again:');
  console.error(`  ${installCommand}`);
}

const mainJs = path.join(__dirname, '..', 'dist', 'main.js');
const bunCommand = resolveBunCommand();

if (!bunCommand) {
  printBunInstallHelp();
  process.exit(1);
}

try {
  const child = spawn(bunCommand, [mainJs, ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: false,
  });

  child.on('error', e => {
    console.error('Error executing Bun:', e.message || e);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
} catch (e) {
  console.error('Error executing Bun:', e.message || e);
  process.exit(e.status ?? 1);
}
