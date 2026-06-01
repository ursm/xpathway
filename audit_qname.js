import { tokenize, T } from './src/lexer.js';
import { parse } from './src/parser.js';

// Test QName edge cases
const tests = [
  { expr: 'pre:', label: 'prefix alone - should error' },
  { expr: ':local', label: 'local without prefix - should error' },
  { expr: 'pre::', label: 'prefix double colon' },
  { expr: 'pre:local:more', label: 'too many colons' },
  { expr: 'pre:*', label: 'prefix star' },
  { expr: '*:local', label: 'star with local' },
];

tests.forEach(({expr, label}) => {
  try {
    const tokens = tokenize(expr);
    console.log(`✓ TOKENIZE: ${label}`);
    console.log(`  "${expr}"`);
    console.log(`  tokens: ${tokens.slice(0, -1).map(t => {
      if (t.value && typeof t.value === 'object') {
        return `${t.type}:{prefix:${t.value.prefix},local:${t.value.local}}`;
      }
      return t.type;
    }).join(' ')}`);
    
    try {
      parse(expr);
      console.log(`  parsed OK`);
    } catch (e) {
      console.log(`  parse error: ${e.message.substring(0, 60)}`);
    }
  } catch (e) {
    console.log(`✗ TOKENIZE ERROR: ${label}`);
    console.log(`  "${expr}"`);
    console.log(`  error: ${e.message.substring(0, 80)}`);
  }
  console.log();
});
