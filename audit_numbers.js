import { tokenize, T } from './src/lexer.js';

// Per REC §3.7: "Numbers ::= Digits ('.' Digits?)? | '.' Digits"
// So valid number forms are:
// - "42" (digits)
// - "3.14" (digits . digits)
// - "10." (digits . with optional following digits)  
// - ".5" (. digits)
//
// Invalid:
// - "." (just dot, no leading or trailing digits)
// - "1.2.3" (only first 1.2 is a number, then .3 is separate)
// - "10.a" (invalid, . must be followed by digit or nothing)

const tests = [
  { expr: '10.', wanted: ['NUMBER:10', 'EOF'], desc: 'digits dot EOF' },
  { expr: '10.a', wanted: ['NUMBER:10', 'NAMETEST', 'EOF'], desc: 'digits dot name' },
  { expr: '.', wanted: ['DOT', 'EOF'], desc: 'lone dot' },
  { expr: '.5', wanted: ['NUMBER:0.5', 'EOF'], desc: 'dot digits' },
  { expr: '.a', wanted: ['DOT', 'NAMETEST', 'EOF'], desc: 'dot name' },
  { expr: '1.2.3', wanted: ['NUMBER:1.2', 'NUMBER:0.3', 'EOF'], desc: '1.2.3 -> two numbers' },
  { expr: '1..2', wanted: ['NUMBER:1', 'DOTDOT', 'NUMBER:2', 'EOF'], desc: '1..2 parent operator' },
  { expr: '10.+5', wanted: ['NUMBER:10', 'PLUS', 'NUMBER:5', 'EOF'], desc: '10 . + 5' },
  { expr: '10.5', wanted: ['NUMBER:10.5', 'EOF'], desc: '10.5 normal decimal' },
];

tests.forEach(({expr, wanted, desc}) => {
  const tokens = tokenize(expr);
  const got = tokens.map(t => {
    if (t.type === 'NUMBER') return `NUMBER:${t.value}`;
    if (t.type === 'NAMETEST') return 'NAMETEST';
    return t.type;
  });
  
  const match = JSON.stringify(got) === JSON.stringify(wanted);
  const status = match ? '✓' : '✗';
  
  console.log(`${status} ${desc}`);
  console.log(`  expr: "${expr}"`);
  if (!match) {
    console.log(`  wanted: ${wanted.join(' ')}`);
    console.log(`  got:    ${got.join(' ')}`);
  }
  console.log();
});
