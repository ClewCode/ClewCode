/**
 * Semver comparison utilities that use Bun.semver when available
 * and fall back to the npm `semver` package in Node.js environments.
 *
 * Bun.semver.order() is ~20x faster than npm semver comparisons.
 * The npm semver fallback always uses { loose: true }.
 */
let _npmSemver;
function getNpmSemver() {
    if (!_npmSemver) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        _npmSemver = require('semver');
    }
    return _npmSemver;
}
export function gt(a, b) {
    if (typeof Bun !== 'undefined') {
        return Bun.semver.order(a, b) === 1;
    }
    return getNpmSemver().gt(a, b, { loose: true });
}
export function gte(a, b) {
    if (typeof Bun !== 'undefined') {
        return Bun.semver.order(a, b) >= 0;
    }
    return getNpmSemver().gte(a, b, { loose: true });
}
export function lt(a, b) {
    if (typeof Bun !== 'undefined') {
        return Bun.semver.order(a, b) === -1;
    }
    return getNpmSemver().lt(a, b, { loose: true });
}
export function lte(a, b) {
    if (typeof Bun !== 'undefined') {
        return Bun.semver.order(a, b) <= 0;
    }
    return getNpmSemver().lte(a, b, { loose: true });
}
export function satisfies(version, range) {
    if (typeof Bun !== 'undefined') {
        return Bun.semver.satisfies(version, range);
    }
    return getNpmSemver().satisfies(version, range, { loose: true });
}
export function order(a, b) {
    if (typeof Bun !== 'undefined') {
        return Bun.semver.order(a, b);
    }
    return getNpmSemver().compare(a, b, { loose: true });
}
