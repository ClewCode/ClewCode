import { execSync } from 'node:child_process';
import ansis from 'ansis';
import { getLatestVersion, resolveUpdateStrategy } from 'src/utils/autoUpdater.js';
import { installLatest } from 'src/utils/nativeInstaller/installer.js';

export async function update() {
  const current = MACRO.VERSION;
  const pkg = MACRO.PACKAGE_URL;

  console.log(`Current version: ${ansis.bold(current)}`);

  // Pick the update path that matches how Clew was installed. Running npm/bun
  // over a brew/winget/apt/native install would create a conflicting parallel
  // copy (or "update" a binary the shell never resolves), so route accordingly.
  const strategy = await resolveUpdateStrategy();

  // Native installs have their own updater that manages symlinks/versions.
  if (strategy.kind === 'native') {
    console.log('Installing update via the native installer...');
    const result = await installLatest('latest');
    if (result.wasUpdated) {
      console.log(ansis.green(`Successfully updated to ${result.latestVersion ?? 'latest'}`));
      console.log('Restart clew to use the new version.');
    } else if (result.lockFailed) {
      console.error(ansis.red('Another update is already in progress. Try again shortly.'));
      process.exit(1);
    } else {
      console.log(ansis.green('Clew Code is already up to date.'));
    }
    return;
  }

  const latest = await getLatestVersion('latest');
  if (!latest) {
    console.error(ansis.red('Failed to check for updates from npm registry'));
    console.error('Check your network connection or try again later.');
    process.exit(1);
  }

  if (latest === current) {
    console.log(ansis.green(`Clew Code is up to date (${current})`));
    return;
  }

  console.log(`New version available: ${ansis.bold(latest)} (current: ${current})`);

  // Installed by a system package manager (brew/winget/apt/…): don't self-update,
  // tell the user the correct command for their package manager.
  if (strategy.kind === 'managed') {
    console.log(`Clew was installed via ${ansis.bold(strategy.manager)}. Update it with:`);
    console.log(`  ${ansis.bold(strategy.command)}`);
    return;
  }

  // Plain npm/bun global install — update with the same package manager.
  const installCmd = `${strategy.pm} install -g ${pkg}@latest --ignore-scripts`;
  console.log(`Installing update with ${strategy.pm}...`);

  try {
    execSync(installCmd, { stdio: 'inherit' });
    console.log(ansis.green(`Successfully updated from ${current} to ${latest}`));
    console.log('Restart clew to use the new version.');
  } catch {
    console.error(ansis.red('Failed to install update.'));
    console.error(`Try running manually: ${installCmd}`);
    process.exit(1);
  }
}
