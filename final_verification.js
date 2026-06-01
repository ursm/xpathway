import { tokenize } from './src/lexer.js';

// Final verification of the main bug: 1..2
console.log('PRIMARY FINDING: 1..2 tokenization bug\n');

const expr = '1..2';
const tokens = tokenize(expr);

console.log(`Expression: "${expr}"`);
console.log(`Character positions:`);
for (let i = 0; i < expr.length; i++) {
  console.log(`  [${i}] = '${expr[i]}'`);
}
console.log();

console.log(`Actual tokens produced:`);
tokens.slice(0, -1).forEach((t, i) => {
  console.log(`  [${i}] ${t.type}: ${JSON.stringify(t.value)}`);
});
console.log();

console.log(`Expected per XPath 1.0 REC §3.7:`);
console.log(`  [0] NUMBER: 1`);
console.log(`  [1] DOTDOT: ..`);
console.log(`  [2] NUMBER: 2`);
console.log();

console.log(`Root cause:`);
console.log(`  At lexer.js:245, when processing digit "1" followed by "..",`);
console.log(`  the code sees expr[i]==="." and enters the decimal number branch.`);
console.log(`  It should first check if expr[i+1]==="." to avoid consuming`);
console.log(`  the first dot of the ".." operator.`);
console.log();
console.log(`  Current code at line 245-251 does NOT check for expr[i+1]==="."`);
console.log(`  This causes "1." to be parsed as NUMBER:1`);
console.log(`  Then ".2" is parsed as NUMBER:0.2 in the next iteration`);
