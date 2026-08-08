import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

const CONVERT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

/**
 * Converts an office document (docx/pptx/xlsx/odt/...) to Markdown using the
 * anydoc CLI. The CLI is spawned as `node <cli.js> <file>` (no shell), so the
 * file path is passed as a single argv element and never touches a shell.
 */
export async function convertOfficeToMarkdown(filePath: string, signal?: AbortSignal): Promise<string> {
  let cliPath: string;
  try {
    cliPath = join(dirname(require.resolve('@firecrawl/anydoc/package.json')), 'cli.js');
  } catch {
    throw new Error(
      'Reading office documents requires the anydoc converter. Run `bun add @firecrawl/anydoc` and retry.',
    );
  }

  return new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, filePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      signal,
    });

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_OUTPUT_BYTES) {
        child.kill();
        reject(new Error(`anydoc output exceeds ${MAX_OUTPUT_BYTES} bytes; document too large to read.`));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`anydoc timed out after ${CONVERT_TIMEOUT_MS}ms`));
    }, CONVERT_TIMEOUT_MS);
    timeout.unref();

    child.on('error', error => {
      clearTimeout(timeout);
      reject(new Error(`Failed to run anydoc converter: ${error.message}`));
    });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(Buffer.concat(chunks).toString('utf8'));
      } else {
        reject(new Error(`anydoc failed (exit ${code}): ${stderr.trim() || 'unable to convert document'}`));
      }
    });
  });
}
