const fs = require('fs');
const content = fs.readFileSync('src/utils/sessionStorage.ts', 'utf8');
const lines = content.split('\n');
let depth = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let char of line) {
        if (char === '{') { depth++; }
        if (char === '}') { depth--; }
    }
    if (i + 1 === 1409) {
        console.log(`Depth at line 1409: ${depth}`);
    }
}
console.log(`Final depth: ${depth}`);
