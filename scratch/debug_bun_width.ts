
const testStr = 'ฒา';
console.log(`String: "${testStr}"`);
if (typeof Bun !== 'undefined' && typeof Bun.stringWidth === 'function') {
    console.log(`Bun.stringWidth: ${Bun.stringWidth(testStr)}`);
    for (let i = 0; i < testStr.length; i++) {
        console.log(`Char ${i} width: ${Bun.stringWidth(testStr[i])}`);
    }
} else {
    console.log('Bun.stringWidth not available');
}
