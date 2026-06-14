import { ansiCodesToString, reduceAnsiCodes, tokenize, undoAnsiCodes, } from '@alcalzone/ansi-tokenize';
export function segmentTextByHighlights(text, highlights) {
    if (highlights.length === 0) {
        return [{ text, start: 0 }];
    }
    const sortedHighlights = [...highlights].sort((a, b) => {
        if (a.start !== b.start)
            return a.start - b.start;
        return b.priority - a.priority;
    });
    const resolvedHighlights = [];
    const usedRanges = [];
    for (const highlight of sortedHighlights) {
        if (highlight.start === highlight.end)
            continue;
        const overlaps = usedRanges.some(range => (highlight.start >= range.start && highlight.start < range.end) ||
            (highlight.end > range.start && highlight.end <= range.end) ||
            (highlight.start <= range.start && highlight.end >= range.end));
        if (!overlaps) {
            resolvedHighlights.push(highlight);
            usedRanges.push({ start: highlight.start, end: highlight.end });
        }
    }
    return new HighlightSegmenter(text).segment(resolvedHighlights);
}
class HighlightSegmenter {
    text;
    tokens;
    // Two position systems: "visible" (what the user sees, excluding ANSI codes)
    // and "string" (raw positions including ANSI codes for substring extraction)
    visiblePos = 0;
    stringPos = 0;
    tokenIdx = 0;
    charIdx = 0; // offset within current text token (for partial consumption)
    codes = [];
    constructor(text) {
        this.text = text;
        this.tokens = tokenize(text);
    }
    segment(highlights) {
        const segments = [];
        for (const highlight of highlights) {
            const before = this.segmentTo(highlight.start);
            if (before)
                segments.push(before);
            const highlighted = this.segmentTo(highlight.end);
            if (highlighted) {
                highlighted.highlight = highlight;
                segments.push(highlighted);
            }
        }
        const after = this.segmentTo(Infinity);
        if (after)
            segments.push(after);
        return segments;
    }
    segmentTo(targetVisiblePos) {
        if (this.tokenIdx >= this.tokens.length || targetVisiblePos <= this.visiblePos) {
            return null;
        }
        const visibleStart = this.visiblePos;
        // Consume leading ANSI codes before first visible char
        while (this.tokenIdx < this.tokens.length) {
            const token = this.tokens[this.tokenIdx];
            if (token.type !== 'ansi')
                break;
            this.codes.push(token);
            this.stringPos += token.code.length;
            this.tokenIdx++;
        }
        const stringStart = this.stringPos;
        const codesStart = [...this.codes];
        // Advance through tokens until we reach target
        while (this.visiblePos < targetVisiblePos && this.tokenIdx < this.tokens.length) {
            const token = this.tokens[this.tokenIdx];
            if (token.type === 'ansi') {
                this.codes.push(token);
                this.stringPos += token.code.length;
                this.tokenIdx++;
            }
            else {
                const charsNeeded = targetVisiblePos - this.visiblePos;
                const charsAvailable = token.value.length - this.charIdx;
                const charsToTake = Math.min(charsNeeded, charsAvailable);
                this.stringPos += charsToTake;
                this.visiblePos += charsToTake;
                this.charIdx += charsToTake;
                if (this.charIdx >= token.value.length) {
                    this.tokenIdx++;
                    this.charIdx = 0;
                }
            }
        }
        // Empty segment (can occur when only trailing ANSI codes remain)
        if (this.stringPos === stringStart) {
            return null;
        }
        const prefixCodes = reduceCodes(codesStart);
        const suffixCodes = reduceCodes(this.codes);
        this.codes = suffixCodes;
        const prefix = ansiCodesToString(prefixCodes);
        const suffix = ansiCodesToString(undoAnsiCodes(suffixCodes));
        return {
            text: prefix + this.text.substring(stringStart, this.stringPos) + suffix,
            start: visibleStart,
        };
    }
}
function reduceCodes(codes) {
    return reduceAnsiCodes(codes).filter(c => c.code !== c.endCode);
}
