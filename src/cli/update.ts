import { execSync } from 'node:child_process';
import ansis from 'ansis';
import { getLatestVersion } from 'src/utils/autoUpdater.js';

export async function update() {
  const current = MACRO.VERSION;
  const pkg = MACRO.PACKAGE_URL;

  console.log(`Current version: ${ansis.bold(current)}`);

  const latest = await getLatestVersion('latest');
  if (!latest) {
    console.error(ansis.red('Failed to check for updates from npm registry'));
    console.error('Check your network connection or try manually:');
    console.error(`  bun install -g ${pkg}@latest --ignore-scripts`);
    process.exit(1);
  }

  if (latest === current) {
    console.log(ansis.green(`Clew Code is up to date (${current})`));
    return;
  }

  console.log(`New version available: ${ansis.bold(latest)} (current: ${current})`);
  console.log('Installing update...');

  try {
    execSync(`bun install -g ${pkg}@latest --ignore-scripts`, { stdio: 'inherit' });
    console.log(ansis.green(`Successfully updated from ${current} to ${latest}`));
    console.log('Restart clew to use the new version.');
  } catch {
    console.error(ansis.red('Failed to install update.'));
    console.error(`Try running manually: bun install -g ${pkg}@latest --ignore-scripts`);
    process.exit(1);
  }
}
