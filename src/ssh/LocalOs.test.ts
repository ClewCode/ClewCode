import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalOs } from './LocalOs.js';

const root = mkdtempSync(join(tmpdir(), 'clew-localos-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('LocalOs filesystem', () => {
  test('writes and reads text', async () => {
    const os = new LocalOs(root);
    await os.writeFile('hello.txt', 'สวัสดี');
    expect(await os.readText('hello.txt')).toBe('สวัสดี');
  });

  test('round-trips binary content byte for byte', async () => {
    const os = new LocalOs(root);
    const bytes = Buffer.from([0x00, 0xff, 0x0a, 0x1b, 0x7f]);
    await os.writeFile('bin.dat', bytes);
    expect(Buffer.compare(await os.readFile('bin.dat'), bytes)).toBe(0);
  });

  test('reports existence without throwing on a missing path', async () => {
    const os = new LocalOs(root);
    expect(await os.exists('nope.txt')).toBe(false);
    expect(await os.exists('hello.txt')).toBe(true);
  });

  test('stat distinguishes files from directories', async () => {
    const os = new LocalOs(root);
    await os.mkdir('sub', { recursive: true });
    expect((await os.stat('sub')).isDirectory).toBe(true);
    expect((await os.stat('hello.txt')).isFile).toBe(true);
  });

  test('wraps a failed read in RemoteOsError naming the path', async () => {
    const os = new LocalOs(root);
    await expect(os.readFile('missing.txt')).rejects.toThrow(/Cannot read/);
  });

  test('lists directory entries with their types', async () => {
    const os = new LocalOs(root);
    await os.mkdir('listing/inner', { recursive: true });
    await os.writeFile('listing/a.txt', 'a');
    const entries = (await os.readdir('listing')).sort((x, y) => x.name.localeCompare(y.name));
    expect(entries).toEqual([
      { name: 'a.txt', isFile: true, isDirectory: false },
      { name: 'inner', isFile: false, isDirectory: true },
    ]);
  });
});

describe('LocalOs cwd', () => {
  test('chdir moves this instance only, never the whole process', async () => {
    const os = new LocalOs(root);
    const before = process.cwd();
    await os.mkdir('cwdtest', { recursive: true });
    await os.chdir('cwdtest');

    expect(os.cwd().endsWith('cwdtest')).toBe(true);
    expect(process.cwd()).toBe(before);
  });

  test('chdir onto a file is refused', async () => {
    const os = new LocalOs(root);
    await os.writeFile('afile.txt', 'x');
    await expect(os.chdir('afile.txt')).rejects.toThrow(/not a directory/);
  });

  test('two instances hold independent working directories', async () => {
    const a = new LocalOs(root);
    const b = new LocalOs(root);
    await a.mkdir('one', { recursive: true });
    await b.mkdir('two', { recursive: true });
    await a.chdir('one');
    await b.chdir('two');

    expect(a.cwd()).not.toBe(b.cwd());
  });
});

describe('LocalOs exec', () => {
  test('runs a command and captures stdout and the exit code', async () => {
    const os = new LocalOs(root);
    const result = await os.exec(process.execPath, ['-e', 'process.stdout.write("ok")']);

    expect(result.stdout).toBe('ok');
    expect(result.exitCode).toBe(0);
    expect(result.aborted).toBe(false);
  });

  test('captures stderr and a non-zero exit', async () => {
    const os = new LocalOs(root);
    const result = await os.exec(process.execPath, ['-e', 'process.stderr.write("bad");process.exit(3)']);

    expect(result.stderr).toBe('bad');
    expect(result.exitCode).toBe(3);
  });

  test('arguments are not interpreted by a shell', async () => {
    const os = new LocalOs(root);
    // If a shell were involved, $(...) would be substituted before node saw it.
    const result = await os.exec(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', '$(whoami)']);

    expect(result.stdout).toBe('$(whoami)');
  });

  test('an aborted command reports aborted', async () => {
    const os = new LocalOs(root);
    const controller = new AbortController();
    const running = os.exec(process.execPath, ['-e', 'setTimeout(()=>{}, 60000)'], { signal: controller.signal });
    controller.abort();

    expect((await running).aborted).toBe(true);
  });

  test('a timeout kills the command', async () => {
    const os = new LocalOs(root);
    const result = await os.exec(process.execPath, ['-e', 'setTimeout(()=>{}, 60000)'], { timeoutMs: 50 });

    expect(result.aborted).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  test('output past maxBuffer is truncated and flagged', async () => {
    const os = new LocalOs(root);
    const result = await os.exec(process.execPath, ['-e', 'process.stdout.write("x".repeat(5000))'], {
      maxBuffer: 100,
    });

    expect(result.truncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(100);
  });
});
