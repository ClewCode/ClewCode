/**
 * Semver comparison utilities that use Bun.semver when available
 * and fall back to the npm `semver` package in Node.js environments.
 *
 * Bun.semver.order() is ~20x faster than npm semver comparisons.
 * The npm semver fallback always uses { loose: true }.
 */

let _npmSemver: typeof import('semver') | undefined;

function getNpmSemver(): typeof import('semver') {
  if (!_npmSemver) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _npmSemver = require('semver') as typeof import('semver');
  }
  return _npmSemver;
}

function clean(v: string): string {
  return v.replace(/^\[|\]$/g, '');
}

export function gt(a: string, b: string): boolean {
  const ca = clean(a),
    cb = clean(b);
  if (typeof Bun !== 'undefined') {
    try {
      return Bun.semver.order(ca, cb) === 1;
    } catch {
      return getNpmSemver().gt(ca, cb, { loose: true });
    }
  }
  return getNpmSemver().gt(ca, cb, { loose: true });
}

export function gte(a: string, b: string): boolean {
  const ca = clean(a),
    cb = clean(b);
  if (typeof Bun !== 'undefined') {
    try {
      return Bun.semver.order(ca, cb) >= 0;
    } catch {
      return getNpmSemver().gte(ca, cb, { loose: true });
    }
  }
  return getNpmSemver().gte(ca, cb, { loose: true });
}

export function lt(a: string, b: string): boolean {
  const ca = clean(a),
    cb = clean(b);
  if (typeof Bun !== 'undefined') {
    try {
      return Bun.semver.order(ca, cb) === -1;
    } catch {
      return getNpmSemver().lt(ca, cb, { loose: true });
    }
  }
  return getNpmSemver().lt(ca, cb, { loose: true });
}

export function lte(a: string, b: string): boolean {
  const ca = clean(a),
    cb = clean(b);
  if (typeof Bun !== 'undefined') {
    try {
      return Bun.semver.order(ca, cb) <= 0;
    } catch {
      return getNpmSemver().lte(ca, cb, { loose: true });
    }
  }
  return getNpmSemver().lte(ca, cb, { loose: true });
}

export function satisfies(version: string, range: string): boolean {
  const cv = clean(version);
  if (typeof Bun !== 'undefined') {
    try {
      return Bun.semver.satisfies(cv, range);
    } catch {
      return getNpmSemver().satisfies(cv, range, { loose: true });
    }
  }
  return getNpmSemver().satisfies(cv, range, { loose: true });
}

export function order(a: string, b: string): -1 | 0 | 1 {
  // Strip brackets from changelog-style versions like "[0.3.7]" → "0.3.7"
  const cleanA = a.replace(/^\[|\]$/g, '');
  const cleanB = b.replace(/^\[|\]$/g, '');
  if (typeof Bun !== 'undefined') {
    try {
      return Bun.semver.order(cleanA, cleanB);
    } catch {
      // Fallback to npm semver loose for malformed versions
      return getNpmSemver().compare(cleanA, cleanB, { loose: true });
    }
  }
  return getNpmSemver().compare(cleanA, cleanB, { loose: true });
}
