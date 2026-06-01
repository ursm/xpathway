import { tokenize, T } from './src/lexer.js';

// One more verification of the 1..2 bug and another edge case

// The REC §3.7 number rule: "Numbers ::= Digits ('.' Digits?)? | '.' Digits"
// This means:
// - "123" -> NUMBER
// - "123.456" -> NUMBER  
// - "123." -> NUMBER (Digits . with zero Digits)
// - ".456" -> NUMBER
// - "." -> NOT a number (needs at least one digit)
//
// BUT there's a context issue:
// When we see "123.", we must NOT consume the dot if it's followed by 
// another dot (because ".." is a different token).
// 
// The fix is to check: if (expr[i] === '.' && expr[i+1] !== '.') 
// before consuming the dot as a decimal point.

const cases = [
  { expr: '1..2', expect: 'NUMBER:1 DOT DOT NUMBER:2', actual: null },
  { expr: '1...2', expect: 'NUMBER:1 DOT DOT NUMBER:2', actual: null }, // oops, this has 3 dots
  { expr: '1.', expect: 'NUMBER:1', actual: null },
  { expr: '1.+2', expect: 'NUMBER:1 PLUS NUMBER:2', actual: null },
];

cases.forEach(c => {
  const tokens = tokenize(c.expr);
  const got = tokens.slice(0, -1).map(t => {
    if (t.type === 'NUMBER') return `NUMBER:${t.value}`;
    return t.type;
  }).join(' ');
  c.actual = got;
  const match = got === c.expect;
  console.log(`${match ? '✓' : '✗'} "${c.expr}"`);
  console.log(`  expected: ${c.expect}`);
  console.log(`  actual:   ${c.actual}`);
  console.log();
});
