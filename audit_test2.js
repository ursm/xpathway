import { tokenize, T } from './src/lexer.js';
import { parse } from './src/parser.js';

const tests = [
  // Issue with . after digits: "10." should tokenize as NUMBER:10 followed by next token
  // But in operator position followed by + the DOT is lost
  { expr: '10.+5', label: '10.+5 - is dot consumed as decimal point?' },
  
  // Per REC §3.7, rule 1: after a name test (in operator position), both * and bare names
  // should be operators. But a*b without spaces should tokenize * as MULTIPLY
  { expr: 'a*b', label: 'a*b - * should be MULTIPLY after nametest' },
  { expr: 'a * b', label: 'a * b with spaces' },
  
  // Rule about . as number: the spec says "Numbers ::= Digits ('.' Digits?)? | '.' Digits"
  // So "." alone followed by non-digit should NOT be part of a number
  { expr: '.', label: 'lone dot' },
  
  // "10." should match Digits '.' with zero following Digits, so it's NUMBER:10 then DOT/EOF 
  // BUT: "10.5" is NUMBER:10.5
  { expr: '10.5', label: '10.5 decimal number' },
  
  // ".5" should be a number per spec
  { expr: '.5', label: '.5 - decimal starting with dot' },
  
  // "1.2.3" - only first "1.2" should be a number, then ".3" should be invalid or treated as dot then number
  { expr: '1.2.3', label: '1.2.3 - malformed number' },
  
  // div as operator: "div div div" - all three divs should be DIV operators
  { expr: 'div div div', label: 'div div div - all operators' },
  
  // div as nametest: "/div" after / should be nametest
  { expr: '/div', label: '/div - div as nametest' },
  
  // div followed by paren - should be FUNCNAME
  { expr: 'div()', label: 'div() - function name' },
];

tests.forEach(({expr, label}) => {
  try {
    const tokens = tokenize(expr);
    console.log(`✓ ${label}`);
    console.log(`  expr: "${expr}"`);
    console.log(`  tokens: ${tokens.slice(0, -1).map(t => {
      if (t.value === null) return t.type;
      if (typeof t.value === 'object') return `${t.type}`;
      return `${t.type}:${JSON.stringify(t.value)}`;
    }).join(' ')}`);
  } catch (e) {
    console.log(`✗ ${label}`);
    console.log(`  expr: "${expr}"`);
    console.log(`  error: ${e.message}`);
  }
  console.log();
});
