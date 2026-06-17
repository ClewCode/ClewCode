/**
 * PlatformAdapter — cross-platform interface for desktop automation.
 *
 * Each platform (Windows, macOS, Linux) implements this interface using
 * available CLI tools + sharp for image processing.
 */

// ============================================================================
// Types
// ============================================================================

export interface DisplayGeometry {
  width: number;
  height: number;
  scaleFactor: number;
  /** Platform-specific display identifier */
  id?: number | string;
  name?: string;
}

export interface ScreenshotResult {
  base64: string;
  width: number;
  height: number;
}

export interface CursorPosition {
  x: number;
  y: number;
}

export type MouseButton = 'left' | 'right' | 'middle';
export type ClickCount = 1 | 2 | 3;

// ============================================================================
// PlatformAdapter Interface
// ============================================================================

export interface PlatformAdapter {
  /** Platform name for debugging */
  readonly platform: string;

  // ── Display ────────────────────────────────────────────────────────────

  /** Capture the full screen (or primary display) as base64 JPEG */
  screenshot(displayId?: number | string): Promise<ScreenshotResult>;

  /** Get display geometry */
  getDisplaySize(displayId?: number | string): Promise<DisplayGeometry>;

  /** List all available displays */
  listDisplays(): Promise<DisplayGeometry[]>;

  // ── Mouse ──────────────────────────────────────────────────────────────

  /** Move mouse to absolute position */
  mouseMove(x: number, y: number): Promise<void>;

  /** Click at current position */
  mouseClick(button: MouseButton, count: ClickCount): Promise<void>;

  /** Move to (x,y) then click */
  click(x: number, y: number, button: MouseButton, count: ClickCount): Promise<void>;

  /** Scroll at current position */
  scroll(dx: number, dy: number): Promise<void>;

  /** Get current cursor position */
  getCursorPosition(): Promise<CursorPosition>;

  /** Drag from one point to another */
  drag(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void>;

  // ── Keyboard ───────────────────────────────────────────────────────────

  /** Press a key sequence (e.g. "ctrl+shift+a") */
  keyPress(sequence: string): Promise<void>;

  /** Type text character by character */
  typeText(text: string): Promise<void>;

  // ── Clipboard ──────────────────────────────────────────────────────────

  /** Read clipboard contents */
  clipboardRead(): Promise<string>;

  /** Write text to clipboard */
  clipboardWrite(text: string): Promise<void>;
}

// ============================================================================
// Shared utilities
// ============================================================================

const JPEG_QUALITY = 0.75;
const MAX_DIM = 2048;

/**
 * Resize and compress image buffer to base64 JPEG using sharp.
 * Maintains aspect ratio, max dimension 2048px (same as Anthropic's API limit).
 */
export async function toBase64Jpeg(buffer: Buffer): Promise<{ base64: string; width: number; height: number }> {
  const sharp = (await import('sharp')).default;
  const img = sharp(buffer);
  const meta = await img.metadata();
  let w = meta.width ?? MAX_DIM;
  let h = meta.height ?? MAX_DIM;

  // Resize if exceeds max dimension
  if (w > MAX_DIM || h > MAX_DIM) {
    const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const jpeg = await img
    .resize(w, h, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return {
    base64: jpeg.toString('base64'),
    width: w,
    height: h,
  };
}
