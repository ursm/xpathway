import { tokenize, T } from './src/lexer.js';
import { parse } from './src/parser.js';

// A few more edge cases

// 1. Can you use a function with both prefix and no paren?
// e.g., "svg:rect" - this should be NAMETEST (name test), not FUNCNAME
// because no paren follows

// 2. Processing-instruction() with and without argument
// should both parse

// 3. Check if parsing handles a * after operator correctly
// e.g., "a | * b" should be parsed as union of (a) and (multiply (*) b)? 
// Actually no, after | we're in name position, so * is NAMETEST

// 4. Complex predicate nesting

const tests = [
  { expr: 'svg:rect', expect: 'NAMETEST', desc: 'prefix name without paren' },
  { expr: 'svg:rect()', expect: 'FUNCNAME LPAREN RPAREN', desc: 'prefix function' },
  { expr: 'processing-instruction()', expect: 'NODETYPE LPAREN RPAREN', desc: 'processing-instruction()' },
  { expr: "processing-instruction('x')", expect: 'NODETYPE LPAREN LITERAL RPAREN', desc: "processing-instruction('x')" },
  { expr: 'a | * [1]', expect: 'NAMETEST PIPE NAMETEST LBRACKET NUMBER RBRACKET', desc: 'union with wildcard predicate' },
  { expr: 'a[b[c]]', expect: 'NAMETEST LBRACKET NAMETEST LBRACKET NAMETEST RBRACKET RBRACKET', desc: 'nested predicates' },
];

tests.forEach(({expr, expect, desc}) => {
  const tokens = tokenize(expr);
  const got = tokens.slice(0, -1).map(t => {
    if (t.type === 'NUMBER') return 'NUMBER';
    if (t.type === 'LITERAL') return 'LITERAL';
    if (t.value && typeof t.value === 'object') return t.type;
    return t.type;
  }).join(' ');
  
  const match = got === expect;
  console.log(`${match ? '✓' : '✗'} ${desc}`);
  console.log(`  "${expr}"`);
  if (!match) {
    console.log(`  expected: ${expect}`);
    console.log(`  got:      ${got}`);
  }
  console.log();
});
