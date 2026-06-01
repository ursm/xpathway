import { tokenize, T } from './src/lexer.js';

// Per REC §3.7 rule 1, after an OPERATOR token itself, the next name/star should 
// NOT be an operator (we're in a name position). So "* *" should be NAMETEST NAMETEST.
// But also "div div" where the first div is an operator should be DIV NAMETEST.

const tests = [
  { expr: '* * 5', label: 'multiply then multiply then number' },
  { expr: '5 * * 5', label: 'number multiply multiply number - should both be multiply' },
  { expr: 'a and and b', label: 'a AND AND b - second and should be NAMETEST' },
  { expr: 'a or or b', label: 'a OR OR b' },
  { expr: 'a mod mod b', label: 'a MOD MOD b' },
  { expr: '5 + and 3', label: 'number plus and number' },
  { expr: '( div )', label: 'paren div paren - div in primary position' },
];

tests.forEach(({expr, label}) => {
  try {
    const tokens = tokenize(expr);
    console.log(`✓ ${label}`);
    console.log(`  "${expr}"`);
    console.log(`  ${tokens.slice(0, -1).map(t => t.type).join(' ')}`);
  } catch (e) {
    console.log(`✗ ${label}`);
    console.log(`  "${expr}"`);
    console.log(`  ERROR: ${e.message}`);
  }
  console.log();
});
