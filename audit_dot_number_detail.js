import { tokenize, T } from './src/lexer.js';

// The bug: in "1..2", the first dot is consumed as part of "1." 
// producing NUMBER:1, then the second dot and 2 are seen as ".2" (NUMBER:0.2)

// The issue is in the number lexing at lines 245-251 of lexer.js:
//   if (expr[i] === '.') {
//     value += '.';
//     i += 1;
//     while (i < n && isDigit(expr[i])) {
//       value += expr[i];
//       i += 1;
//     }
//   }
//
// This code doesn't check if expr[i+1] === '.' (which would mean ".." not a decimal point)
// 
// The subsequent ".. and self" check (lines 258-266) never gets a chance to run
// because the number parser already consumed the first dot.

console.log('Bug in number parsing:');
console.log('Expression: "1..2"');
console.log('Position:    0 1 2 3');
console.log('');
console.log('Step 1: Read digits: "1"');
console.log('Step 2: See expr[i] === "." at position 1');
console.log('Step 3: Check if number should consume dot:');
console.log('  - Code checks "expr[i] === \'.\'" -> true');
console.log('  - Code SHOULD check "expr[i+1] === \'.\'" -> true');
console.log('  - If so, STOP; don\'t consume this dot');
console.log('');
console.log('Current behavior: number consumes first dot, yielding "1."');
console.log('Then next iteration sees ".2" and parses it as NUMBER:0.2');
console.log('');

const cases = [
  '1..2',
  '1...2',  
  '10..',
  '10...',
];

cases.forEach(expr => {
  const tokens = tokenize(expr);
  console.log(`"${expr}" -> ${tokens.slice(0, -1).map(t => {
    if (t.type === 'NUMBER') return `NUM:${t.value}`;
    return t.type;
  }).join(' ')}`);
});
