import { tokenize, T } from './src/lexer.js';
import { parse } from './src/parser.js';

// More edge cases to test

const tests = [
  // Test if parser allows predicates on . and ..
  { expr: '.[predicate]', wanted_error: true, desc: 'dot with predicate' },
  { expr: '..[2]', wanted_error: true, desc: 'dotdot with predicate' },
  
  // Test if @ can have predicates
  { expr: '@a[1]', wanted_error: true, desc: 'attribute with predicate' },
  
  // Test lone "/" which should parse as root
  { expr: '/', wanted_error: false, desc: 'lone slash' },
  
  // Test "a/" which should error (trailing slash needs step)
  { expr: 'a/', wanted_error: true, desc: 'trailing slash' },
  
  // Test "//" which should be treated as /descendant-or-self::node()/... 
  // But "//" alone without following step should error
  { expr: '//', wanted_error: true, desc: 'lone doubleslash' },
  
  // Test "///" which is "//" followed by "/"
  { expr: '///', wanted_error: true, desc: 'triple slash' },
];

tests.forEach(({expr, wanted_error, desc}) => {
  try {
    const tokens = tokenize(expr);
    try {
      const ast = parse(expr);
      if (wanted_error) {
        console.log(`✗ ${desc}`);
        console.log(`  "${expr}" - should error but parsed OK`);
      } else {
        console.log(`✓ ${desc}`);
        console.log(`  "${expr}" - parsed OK`);
      }
    } catch (e) {
      if (wanted_error) {
        console.log(`✓ ${desc}`);
        console.log(`  "${expr}" - error: ${e.message.substring(0, 60)}`);
      } else {
        console.log(`✗ ${desc}`);
        console.log(`  "${expr}" - unexpected error: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`✗ ${desc}`);
    console.log(`  "${expr}" - tokenize error: ${e.message}`);
  }
  console.log();
});
