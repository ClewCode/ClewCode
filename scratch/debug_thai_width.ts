import { stringWidth } from '../src/ink/stringWidth.ts';
import { getGraphemeSegmenter } from '../src/utils/intl.ts';

const testStr = 'ฒา';
console.log(`String: "${testStr}"`);
console.log(`Width: ${stringWidth(testStr)}`);

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
for (const { segment } of segmenter.segment(testStr)) {
    console.log(`Segment: "${segment}" (Length: ${segment.length})`);
    for (const char of segment) {
        console.log(`  Char: ${char} (U+${char.codePointAt(0).toString(16).padStart(4, '0').toUpperCase()})`);
    }
}
