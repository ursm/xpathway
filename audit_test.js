import { tokenize, T } from './src/lexer.js';
import { parse } from './src/parser.js';

const tests = [
  { expr: '.[1]', label: 'dot followed by bracket should be DOT not number' },
  { expr: '. 5', label: 'dot space 5' },
  { expr: '//text', label: 'text as element name, not nodetest' },
  { expr: '/text()', label: '/text() should have NODETYPE' },
  { expr: '//comment', label: 'comment as element name' },
  { expr: 'count(or)', label: 'or as function arg nametest' },
  { expr: '1 - 2 - 3', label: 'subtraction left associativity' },
  { expr: 'a=b=c', label: 'chained equality' },
  { expr: '10. + 5', label: '10 dot + 5' },
  { expr: 'a[1][2]', label: 'multiple predicates' },
  { expr: 'a//', label: 'trailing // should error' },
  { expr: '(//a)[1]', label: 'filterexpr with //' },
];

tests.forEach(({expr, label}) => {
  try {
    const tokens = tokenize(expr);
    console.log(`✓ TOKENIZE: ${label}`);
    console.log(`  expr: ${expr}`);
    console.log(`  tokens: ${tokens.slice(0, -1).map(t => `${t.type}${t.value ? ':' + JSON.stringify(t.value) : ''}`).join(' ')}`);
    
    try {
      const ast = parse(expr);
      console.log(`  parsed OK`);
    } catch (e) {
      console.log(`  parse error: ${e.message}`);
    }
  } catch (e) {
    console.log(`✗ TOKENIZE ERROR: ${label}`);
    console.log(`  expr: ${expr}`);
    console.log(`  error: ${e.message}`);
  }
  console.log();
});
