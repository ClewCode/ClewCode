import { feature } from 'bun:bundle';
import { randomBytes } from 'crypto';
import { execa } from 'execa';
import { basename, extname, isAbsolute, join } from 'path';
import { IMAGE_MAX_HEIGHT, IMAGE_MAX_WIDTH, IMAGE_TARGET_RAW_SIZE } from '../constants/apiLimits.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js';
import { getImageProcessor } from '../tools/FileReadTool/imageProcessor.js';
import { logForDebugging } from './debug.js';
import { execFileNoThrowWithCwd } from './execFileNoThrow.js';
import { getFsImplementation } from './fsOperations.js';
import {
  detectImageFormatFromBase64,
  type ImageDimensions,
  maybeResizeAndDownsampleImageBuffer,
} from './imageResizer.js';
import { logError } from './log.js';

// Native NSPasteboard reader. GrowthBook gate tengu_collage_kaleidoscope is
// a kill switch (default on). Falls through to osascript when off.
// The gate string is inlined at each callsite INSIDE the feature() condition
// — module-scope helpers are NOT tree-shaken (see docs/feature-gating.md).

type SupportedPlatform = 'darwin' | 'linux' | 'win32';

// Threshold in characters for when to consider text a "large paste"
export const PASTE_THRESHOLD = 800;
const CLIPBOARD_IMAGE_CHECK_TIMEOUT_MS = 3000;

async function runClipboardImageCheck(command: string): Promise<boolean> {
  try {
    const result = await execa(command, {
      shell: true,
      reject: false,
      timeout: CLIPBOARD_IMAGE_CHECK_TIMEOUT_MS,
    });

    if (result.exitCode !== 0) {
      return false;
    }

    return process.platform === 'win32' ? result.stdout?.trim().toLowerCase() === 'true' : true;
  } catch (e) {
    logError(e as Error);
    return false;
  }
}

function getClipboardCommands() {
  const platform = process.platform as SupportedPlatform;

  // Platform-specific temporary file paths
  // Use CLAUDE_CODE_TMPDIR if set, otherwise fall back to platform defaults
  const baseTmpDir = process.env.CLAUDE_CODE_TMPDIR || (platform === 'win32' ? process.env.TEMP || 'C:\\Temp' : '/tmp');
  const screenshotFilename = 'claude_cli_latest_screenshot.png';
  const tempPaths: Record<SupportedPlatform, string> = {
    darwin: join(baseTmpDir, screenshotFilename),
    linux: join(baseTmpDir, screenshotFilename),
    win32: join(baseTmpDir, screenshotFilename),
  };

  const screenshotPath = tempPaths[platform] || tempPaths.linux;

  // Detect WSL2: Linux kernel with Microsoft kernel build or WSL-specific env vars.
  // On WSL2, xclip/wl-paste can't access the Windows clipboard, so fall back
  // to powershell.exe via the Windows host (H34).
  const isWSL =
    platform === 'linux' &&
    (!!process.env.WSLENV || !!process.env.WSL_DISTRO_NAME || process.env.OS?.startsWith('Windows'));

  // Platform-specific clipboard commands
  const commands: Record<
    SupportedPlatform,
    {
      checkImage: string;
      saveImage: string;
      getPath: string;
      deleteFile: string;
    }
  > = {
    darwin: {
      checkImage: `osascript -e 'the clipboard as «class PNGf»'`,
      saveImage: `osascript -e 'set png_data to (the clipboard as «class PNGf»)' -e 'set fp to open for access POSIX file "${screenshotPath}" with write permission' -e 'write png_data to fp' -e 'close access fp'`,
      getPath: `osascript -e 'get POSIX path of (the clipboard as «class furl»)'`,
      deleteFile: `rm -f "${screenshotPath}"`,
    },
    linux: {
      checkImage:
        `xclip -selection clipboard -t TARGETS -o 2>/dev/null | grep -E "image/(png|jpeg|jpg|gif|webp|bmp)" || ` +
        `wl-paste -l 2>/dev/null | grep -E "image/(png|jpeg|jpg|gif|webp|bmp)"` +
        (isWSL ? ` || powershell.exe -NoProfile -Command "(Get-Clipboard -Format Image) -ne ` + '$null"' : ''),
      saveImage:
        `xclip -selection clipboard -t image/png -o > "${screenshotPath}" 2>/dev/null || ` +
        `wl-paste --type image/png > "${screenshotPath}" 2>/dev/null || ` +
        `xclip -selection clipboard -t image/bmp -o > "${screenshotPath}" 2>/dev/null || ` +
        `wl-paste --type image/bmp > "${screenshotPath}"` +
        (isWSL
          ? ` || powershell.exe -NoProfile -Command "$img = Get-Clipboard -Format Image; if ($img) { $img.Save('${screenshotPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png) }"`
          : ''),
      getPath:
        `xclip -selection clipboard -t text/plain -o 2>/dev/null || wl-paste 2>/dev/null` +
        (isWSL ? ` || powershell.exe -NoProfile -Command "Get-Clipboard"` : ''),
      deleteFile: `rm -f "${screenshotPath}"`,
    },
    win32: {
      checkImage:
        'powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $f=[System.Windows.Forms.Clipboard]::GetDataObject(); if ($f.GetDataPresent([System.Windows.Forms.DataFormats]::Bitmap) -or $f.GetDataPresent([System.Windows.Forms.DataFormats]::Dib)) { exit 0 } else { exit 1 }"',
      saveImage: `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $f=[System.Windows.Forms.Clipboard]::GetDataObject(); if ($f.GetDataPresent([System.Windows.Forms.DataFormats]::Bitmap)) { ($f.GetData([System.Windows.Forms.DataFormats]::Bitmap)).Save('${screenshotPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png) } elseif ($f.GetDataPresent([System.Windows.Forms.DataFormats]::Dib)) { $bytes=$f.GetData([System.Windows.Forms.DataFormats]::Dib); [System.IO.File]::WriteAllBytes('${screenshotPath.replace(/\\/g, '\\\\')}', $bytes) }"`,
      getPath: 'powershell -NoProfile -Command "Get-Clipboard"',
      deleteFile: `del /f "${screenshotPath}"`,
    },
  };

  return {
    commands: commands[platform] || commands.linux,
    screenshotPath,
  };
}

export type ImageWithDimensions = {
  base64: string;
  mediaType: string;
  dimensions?: ImageDimensions;
};

/**
 * Check if clipboard contains an image without retrieving it.
 */
export async function hasImageInClipboard(): Promise<boolean> {
  if (process.platform === 'darwin') {
    if (feature('NATIVE_CLIPBOARD_IMAGE') && getFeatureValue_CACHED_MAY_BE_STALE('tengu_collage_kaleidoscope', true)) {
      // Native NSPasteboard check (~0.03ms warm). Fall through to osascript
      // when the module/export is missing. Catch a throw too: it would surface
      // as an unhandled rejection in useClipboardImageHint's setTimeout.
      try {
        const { getNativeModule } = await import('image-processor-napi');
        const hasImage = getNativeModule()?.hasClipboardImage;
        if (hasImage) {
          return hasImage();
        }
      } catch (e) {
        logError(e as Error);
      }
    }
    const result = await execFileNoThrowWithCwd('osascript', ['-e', 'the clipboard as «class PNGf»']);
    return result.code === 0;
  }

  const { commands } = getClipboardCommands();
  return runClipboardImageCheck(commands.checkImage);
}

export async function getImageFromClipboard(): Promise<ImageWithDimensions | null> {
  // Fast path: native NSPasteboard reader (macOS only). Reads PNG bytes
  // directly in-process and downsamples via CoreGraphics if over the
  // dimension cap. ~5ms cold, sub-ms warm — vs. ~1.5s for the osascript
  // path below. Throws if the native module is unavailable, in which case
  // the catch block falls through to osascript. A `null` return from the
  // native call is authoritative (clipboard has no image).
  if (
    feature('NATIVE_CLIPBOARD_IMAGE') &&
    process.platform === 'darwin' &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_collage_kaleidoscope', true)
  ) {
    try {
      const { getNativeModule } = await import('image-processor-napi');
      const readClipboard = getNativeModule()?.readClipboardImage;
      if (!readClipboard) {
        throw new Error('native clipboard reader unavailable');
      }
      const native = readClipboard(IMAGE_MAX_WIDTH, IMAGE_MAX_HEIGHT);
      if (!native) {
        return null;
      }
      // The native path caps dimensions but not file size. A complex
      // 2000×2000 PNG can still exceed the 3.75MB raw / 5MB base64 API
      // limit — for that edge case, run through the same size-cap that
      // the osascript path uses (degrades to JPEG if needed). Cheap if
      // already under: just a sharp metadata read.
      const buffer: Buffer = native.png;
      if (buffer.length > IMAGE_TARGET_RAW_SIZE) {
        const resized = await maybeResizeAndDownsampleImageBuffer(buffer, buffer.length, 'png');
        return {
          base64: resized.buffer.toString('base64'),
          mediaType: `image/${resized.mediaType}`,
          // resized.dimensions sees the already-downsampled buffer; native knows the true originals.
          dimensions: {
            originalWidth: native.originalWidth,
            originalHeight: native.originalHeight,
            displayWidth: resized.dimensions?.displayWidth ?? native.width,
            displayHeight: resized.dimensions?.displayHeight ?? native.height,
          },
        };
      }
      return {
        base64: buffer.toString('base64'),
        mediaType: 'image/png',
        dimensions: {
          originalWidth: native.originalWidth,
          originalHeight: native.originalHeight,
          displayWidth: native.width,
          displayHeight: native.height,
        },
      };
    } catch (e) {
      logError(e as Error);
      // Fall through to osascript fallback.
    }
  }

  const { commands, screenshotPath } = getClipboardCommands();

  const CLIPBOARD_CHECK_TIMEOUT_MS = 5000;
  const CLIPBOARD_SAVE_TIMEOUT_MS = 8000;

  try {
    // Check if clipboard has image with timeout
    const checkResult = await Promise.race([
      execa(commands.checkImage, {
        shell: true,
        reject: false,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Clipboard check timed out')), CLIPBOARD_CHECK_TIMEOUT_MS),
      ),
    ]);
    if (checkResult.exitCode !== 0) {
      return null;
    }

    // Save the image with timeout
    const saveResult = await Promise.race([
      execa(commands.saveImage, {
        shell: true,
        reject: false,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Clipboard save timed out')), CLIPBOARD_SAVE_TIMEOUT_MS),
      ),
    ]);
    if (saveResult.exitCode !== 0) {
      return null;
    }

    // Read the image and convert to base64
    let imageBuffer = await Promise.race([
      getFsImplementation().readFileBytes(screenshotPath),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Image read timed out')), 10000)),
    ]);

    // BMP is not supported by the API — convert to PNG via Sharp.
    // This handles WSL2 where Windows copies images as BMP by default.
    if (imageBuffer.length >= 2 && imageBuffer[0] === 0x42 && imageBuffer[1] === 0x4d) {
      const sharp = await getImageProcessor();
      imageBuffer = await sharp(imageBuffer).png().toBuffer();
    }

    // Resize if needed to stay under 5MB API limit
    const resized = await maybeResizeAndDownsampleImageBuffer(imageBuffer, imageBuffer.length, 'png');
    const base64Image = resized.buffer.toString('base64');

    // Detect format from magic bytes
    const mediaType = detectImageFormatFromBase64(base64Image);

    // Cleanup (fire-and-forget, don't await)
    void execa(commands.deleteFile, { shell: true, reject: false });

    return {
      base64: base64Image,
      mediaType,
      dimensions: resized.dimensions,
    };
  } catch {
    return null;
  }
}

export async function getImagePathFromClipboard(): Promise<string | null> {
  const { commands } = getClipboardCommands();

  try {
    // Try to get text from clipboard
    const result = await execa(commands.getPath, {
      shell: true,
      reject: false,
    });
    if (result.exitCode !== 0 || !result.stdout) {
      return null;
    }
    return result.stdout.trim();
  } catch (e) {
    logError(e as Error);
    return null;
  }
}

/**
 * Regex pattern to match supported image file extensions. Kept in sync with
 * MIME_BY_EXT in BriefTool/upload.ts — attachments.ts uses this to set isImage
 * on the wire, and remote viewers fetch /preview iff isImage is true. An ext
 * here but not in MIME_BY_EXT (e.g. bmp) uploads as octet-stream and has no
 * /preview variant → broken thumbnail.
 */
export const IMAGE_EXTENSION_REGEX = /\.(png|jpe?g|gif|webp)$/i;
export const VIDEO_EXTENSION_REGEX = /\.(mp4|mov|avi|webm|mkv|flv|wmv|m4v|mpeg|mpg|3gp)$/i;

/**
 * Remove outer single or double quotes from a string
 * @param text Text to clean
 * @returns Text without outer quotes
 */
function removeOuterQuotes(text: string): string {
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

/**
 * Remove shell escape backslashes from a path (for macOS/Linux/WSL)
 * On Windows systems, this function returns the path unchanged
 * @param path Path that might contain shell-escaped characters
 * @returns Path with escape backslashes removed (on macOS/Linux/WSL only)
 */
function stripBackslashEscapes(path: string): string {
  const platform = process.platform as SupportedPlatform;

  // On Windows, don't remove backslashes as they're part of the path
  if (platform === 'win32') {
    return path;
  }

  // On macOS/Linux/WSL, handle shell-escaped paths
  // Double-backslashes (\\) represent actual backslashes in the filename
  // Single backslashes followed by special chars are shell escapes

  // First, temporarily replace double backslashes with a placeholder
  // Use random salt to prevent injection attacks where path contains literal placeholder
  const salt = randomBytes(8).toString('hex');
  const placeholder = `__DOUBLE_BACKSLASH_${salt}__`;
  const withPlaceholder = path.replace(/\\\\/g, placeholder);

  // Remove single backslashes that are shell escapes
  // This handles cases like "name\ \(15\).png" -> "name (15).png"
  const withoutEscapes = withPlaceholder.replace(/\\(.)/g, '$1');

  // Replace placeholders back to single backslashes
  return withoutEscapes.replace(new RegExp(placeholder, 'g'), '\\');
}

/**
 * Check if a given text represents an image file path
 * @param text Text to check
 * @returns Boolean indicating if text is an image path
 */
export function isImageFilePath(text: string): boolean {
  const cleaned = removeOuterQuotes(text.trim());
  const unescaped = stripBackslashEscapes(cleaned);
  return IMAGE_EXTENSION_REGEX.test(unescaped);
}

/**
 * Clean and normalize a text string that might be an image file path
 * @param text Text to process
 * @returns Cleaned text with quotes removed, whitespace trimmed, and shell escapes removed, or null if not an image path
 */
export function asImageFilePath(text: string): string | null {
  const cleaned = removeOuterQuotes(text.trim());
  const unescaped = stripBackslashEscapes(cleaned);

  if (IMAGE_EXTENSION_REGEX.test(unescaped)) {
    return unescaped;
  }

  return null;
}

/**
 * Try to find and read an image file, falling back to clipboard search
 * @param text Pasted text that might be an image filename or path
 * @returns Object containing the image path and base64 data, or null if not found
 */
export async function tryReadImageFromPath(text: string): Promise<(ImageWithDimensions & { path: string }) | null> {
  // Strip terminal added spaces or quotes to dragged in paths
  const cleanedPath = asImageFilePath(text);

  if (!cleanedPath) {
    return null;
  }

  const imagePath = cleanedPath;
  let imageBuffer;

  try {
    if (isAbsolute(imagePath)) {
      imageBuffer = getFsImplementation().readFileBytesSync(imagePath);
    } else {
      // VSCode Terminal just grabs the text content which is the filename
      // instead of getting the full path of the file pasted with cmd-v. So
      // we check if it matches the filename of the image in the clipboard.
      const clipboardPath = await getImagePathFromClipboard();
      if (clipboardPath && imagePath === basename(clipboardPath)) {
        imageBuffer = getFsImplementation().readFileBytesSync(clipboardPath);
      }
    }
  } catch (e) {
    logError(e as Error);
    return null;
  }
  if (!imageBuffer) {
    return null;
  }
  if (imageBuffer.length === 0) {
    logForDebugging(`Image file is empty: ${imagePath}`, { level: 'warn' });
    return null;
  }

  // BMP is not supported by the API — convert to PNG via Sharp.
  if (imageBuffer.length >= 2 && imageBuffer[0] === 0x42 && imageBuffer[1] === 0x4d) {
    const sharp = await getImageProcessor();
    imageBuffer = await sharp(imageBuffer).png().toBuffer();
  }

  // Resize if needed to stay under 5MB API limit
  // Extract extension from path for format hint
  const ext = extname(imagePath).slice(1).toLowerCase() || 'png';
  const resized = await maybeResizeAndDownsampleImageBuffer(imageBuffer, imageBuffer.length, ext);
  const base64Image = resized.buffer.toString('base64');

  // Detect format from the actual file contents using magic bytes
  const mediaType = detectImageFormatFromBase64(base64Image);
  return {
    path: imagePath,
    base64: base64Image,
    mediaType,
    dimensions: resized.dimensions,
  };
}

/**
 * Check if a given text represents a video file path
 * @param text Text to check
 * @returns Boolean indicating if text is a video path
 */
export function isVideoFilePath(text: string): boolean {
  const cleaned = removeOuterQuotes(text.trim());
  const unescaped = stripBackslashEscapes(cleaned);
  return VIDEO_EXTENSION_REGEX.test(unescaped);
}

/**
 * Clean and normalize a text string that might be a video file path
 * @param text Text to process
 * @returns Cleaned text with quotes removed, whitespace trimmed, and shell escapes removed, or null if not a video path
 */
export function asVideoFilePath(text: string): string | null {
  const cleaned = removeOuterQuotes(text.trim());
  const unescaped = stripBackslashEscapes(cleaned);

  if (VIDEO_EXTENSION_REGEX.test(unescaped)) {
    return unescaped;
  }

  return null;
}

/**
 * Try to find and read a video file
 * @param text Pasted text that might be a video filename or path
 * @returns Object containing the video path and base64 data, or null if not found
 */
export async function tryReadVideoFromPath(
  text: string,
): Promise<{ path: string; base64: string; mediaType: string } | null> {
  // Strip terminal added spaces or quotes to dragged in paths
  const cleanedPath = asVideoFilePath(text);

  if (!cleanedPath) {
    return null;
  }

  const videoPath = cleanedPath;
  let videoBuffer;

  try {
    if (isAbsolute(videoPath)) {
      videoBuffer = getFsImplementation().readFileBytesSync(videoPath);
    } else {
      // VSCode Terminal just grabs the text content which is the filename
      const clipboardPath = await getImagePathFromClipboard();
      if (clipboardPath && videoPath === basename(clipboardPath)) {
        videoBuffer = getFsImplementation().readFileBytesSync(clipboardPath);
      }
    }
  } catch (e) {
    logError(e as Error);
    return null;
  }
  if (!videoBuffer) {
    return null;
  }
  if (videoBuffer.length === 0) {
    logForDebugging(`Video file is empty: ${videoPath}`, { level: 'warn' });
    return null;
  }

  // Map extension to MIME type
  const ext = extname(videoPath).slice(1).toLowerCase() || 'mp4';
  const mimeTypeMap: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    flv: 'video/x-flv',
    wmv: 'video/x-ms-wmv',
    m4v: 'video/mp4',
    mpeg: 'video/mpeg',
    mpg: 'video/mpeg',
    '3gp': 'video/3gpp',
  };
  const mediaType = mimeTypeMap[ext] || 'video/mp4';
  const base64Video = videoBuffer.toString('base64');

  return {
    path: videoPath,
    base64: base64Video,
    mediaType,
  };
}
