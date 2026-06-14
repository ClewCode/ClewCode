/**
 * Shared Intl object instances with lazy initialization.
 *
 * Intl constructors are expensive (~0.05-0.1ms each), so we cache instances
 * for reuse across the codebase instead of creating new ones each time.
 * Lazy initialization ensures we only pay the cost when actually needed.
 */
// Segmenters for Unicode text processing (lazily initialized)
let graphemeSegmenter = null;
let wordSegmenter = null;
export function getGraphemeSegmenter() {
    if (!graphemeSegmenter) {
        graphemeSegmenter = new Intl.Segmenter(undefined, {
            granularity: 'grapheme',
        });
    }
    return graphemeSegmenter;
}
/**
 * Extract the first grapheme cluster from a string.
 * Returns '' for empty strings.
 */
export function firstGrapheme(text) {
    if (!text)
        return '';
    const segments = getGraphemeSegmenter().segment(text);
    const first = segments[Symbol.iterator]().next().value;
    return first?.segment ?? '';
}
/**
 * Extract the last grapheme cluster from a string.
 * Returns '' for empty strings.
 */
export function lastGrapheme(text) {
    if (!text)
        return '';
    let last = '';
    for (const { segment } of getGraphemeSegmenter().segment(text)) {
        last = segment;
    }
    return last;
}
export function getWordSegmenter() {
    if (!wordSegmenter) {
        wordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    }
    return wordSegmenter;
}
// RelativeTimeFormat cache (keyed by style:numeric)
const rtfCache = new Map();
export function getRelativeTimeFormat(style, numeric) {
    const key = `${style}:${numeric}`;
    let rtf = rtfCache.get(key);
    if (!rtf) {
        rtf = new Intl.RelativeTimeFormat('en', { style, numeric });
        rtfCache.set(key, rtf);
    }
    return rtf;
}
// Timezone is constant for the process lifetime
let cachedTimeZone = null;
export function getTimeZone() {
    if (!cachedTimeZone) {
        cachedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    return cachedTimeZone;
}
// System locale language subtag (e.g. 'en', 'ja') is constant for the process
// lifetime. null = not yet computed; undefined = computed but unavailable (so
// a stripped-ICU environment fails once instead of retrying on every call).
let cachedSystemLocaleLanguage = null;
export function getSystemLocaleLanguage() {
    if (cachedSystemLocaleLanguage === null) {
        try {
            const locale = Intl.DateTimeFormat().resolvedOptions().locale;
            cachedSystemLocaleLanguage = new Intl.Locale(locale).language;
        }
        catch {
            cachedSystemLocaleLanguage = undefined;
        }
    }
    return cachedSystemLocaleLanguage;
}
