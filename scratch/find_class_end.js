const fs = require('fs');
const content = fs.readFileSync('src/utils/sessionStorage.ts', 'utf8');
const lines = content.split('\n');
let depth = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let lineDepth = 0;
    for (let char of line) {
        if (char === '{') { depth++; lineDepth++; }
        if (char === '}') { depth--; lineDepth--; }
    }
    if (depth < 0) {
        console.log(`Error: Negative depth at line ${i+1}: ${line}`);
        process.exit(1);
    }
    // Optional: log significant depth changes or unexpected top-level braces
    if (i > 530 && i < 1500 && depth === 0 && line.trim() === '}') {
        console.log(`Class potentially closed at line ${i+1}`);
    }
}
console.log(`Final depth: ${depth}`);
