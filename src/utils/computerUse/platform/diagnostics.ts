import { which } from '../../which.js';
import { getChicagoEnabled } from '../gates.js';

export interface DependencyCheckResult {
  name: string;
  path: string | null;
  status: 'ok' | 'missing' | 'warning';
  type: 'required' | 'recommended' | 'optional';
  description: string;
  fixCommand?: string;
}

export interface ComputerUseDiagnostics {
  enabled: boolean;
  platform: string;
  isReady: boolean;
  dependencies: DependencyCheckResult[];
}

export async function checkComputerUseDependencies(): Promise<ComputerUseDiagnostics> {
  const enabled = getChicagoEnabled();
  const platform = process.platform;
  const dependencies: DependencyCheckResult[] = [];

  if (platform === 'darwin') {
    // 1. Check screencapture (built-in)
    const screencapturePath = await which('screencapture');
    dependencies.push({
      name: 'screencapture',
      path: screencapturePath,
      status: screencapturePath ? 'ok' : 'missing',
      type: 'required',
      description: 'Built-in macOS screenshot tool',
      fixCommand: 'Usually pre-installed on macOS.',
    });

    // 2. Check cliclick (external click/input emulator)
    const cliclickPath = await which('cliclick');
    dependencies.push({
      name: 'cliclick',
      path: cliclickPath,
      status: cliclickPath ? 'ok' : 'missing',
      type: 'required',
      description: 'CLI tool to emulate mouse clicks/keyboard',
      fixCommand: 'brew install cliclick',
    });
  } else if (platform === 'win32') {
    // Windows: Check PowerShell
    const powershellPath = await which('powershell');
    dependencies.push({
      name: 'powershell',
      path: powershellPath,
      status: powershellPath ? 'ok' : 'missing',
      type: 'required',
      description: 'Windows PowerShell environment for scripts',
      fixCommand: 'Usually pre-installed on Windows.',
    });
  } else if (platform === 'linux') {
    // Linux: check xdotool
    const xdotoolPath = await which('xdotool');
    dependencies.push({
      name: 'xdotool',
      path: xdotoolPath,
      status: xdotoolPath ? 'ok' : 'missing',
      type: 'required',
      description: 'CLI tool to emulate keyboard/mouse input',
      fixCommand: 'sudo apt-get install xdotool or sudo pacman -S xdotool',
    });

    const isWayland = !!process.env.WAYLAND_DISPLAY;

    // Check screenshot tools
    const grimPath = await which('grim');
    const importPath = await which('import');

    dependencies.push({
      name: 'grim',
      path: grimPath,
      // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
      status: grimPath ? 'ok' : isWayland ? 'missing' : 'optional',
      type: isWayland ? 'required' : 'optional',
      description: 'Screenshot tool for Wayland compositors',
      fixCommand: 'sudo apt-get install grim or sudo pacman -S grim',
    });

    dependencies.push({
      name: 'import',
      path: importPath,
      // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
      status: importPath ? 'ok' : !isWayland ? 'missing' : 'optional',
      type: !isWayland ? 'required' : 'optional',
      description: 'ImageMagick screenshot tool for X11',
      fixCommand: 'sudo apt-get install imagemagick or sudo pacman -S imagemagick',
    });

    // Check clipboard tools
    const wlCopyPath = await which('wl-copy');
    const xclipPath = await which('xclip');

    dependencies.push({
      name: 'wl-clipboard',
      path: wlCopyPath,
      // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
      status: wlCopyPath ? 'ok' : isWayland ? 'missing' : 'optional',
      type: isWayland ? 'recommended' : 'optional',
      description: 'Command line clipboard utility for Wayland',
      fixCommand: 'sudo apt-get install wl-clipboard or sudo pacman -S wl-clipboard',
    });

    dependencies.push({
      name: 'xclip',
      path: xclipPath,
      // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
      status: xclipPath ? 'ok' : !isWayland ? 'missing' : 'optional',
      type: !isWayland ? 'recommended' : 'optional',
      description: 'Command line clipboard utility for X11',
      fixCommand: 'sudo apt-get install xclip or sudo pacman -S xclip',
    });
  }

  // A platform is ready if all "required" dependencies are present
  const isReady = dependencies.every(dep => dep.type !== 'required' || dep.status === 'ok');

  return {
    enabled,
    platform,
    isReady,
    dependencies,
  };
}
