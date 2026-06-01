import { tokenize, T } from './src/lexer.js';
import { parse } from './src/parser.js';

const tests = [
  // Abbreviated step issue: . can be followed by predicate in valid XPath, but .. / @ etc can also
  // But the spec says AbbreviatedStep ::= '.' | '..' and does NOT allow direct predicates
  // Actually wait - let me check the spec. It says:
  // Step ::= AxisSpecifier NodeTest Predicate* | AbbreviatedStep
  // So . and .. are self-contained steps. Can they have predicates?
  // AbbreviatedStep doesn't say Predicate*, so .[1] should be invalid
  { expr: '.[1]', label: 'predicate on dot abbreviated step' },
  { expr: '..[1]', label: 'predicate on dotdot abbreviated step' },
  
  // Processing instruction test: text( ) with space
  { expr: 'text( )', label: 'text with space before paren' },
  { expr: 'processing-instruction( )', label: 'processing-instruction with spaces' },
  
  // Can you chain union?
  { expr: 'a | b | c', label: 'multiple unions' },
  
  // Lone slash with trailing doubleslash
  { expr: '/ //', label: 'slash then doubleslash' },
  
  // Test prefix:* after operators
  { expr: 'a | svg:*', label: 'prefix:* after union' },
];

tests.forEach(({expr, label}) => {
  try {
    const tokens = tokenize(expr);
    console.log(`✓ TOKENIZE: ${label}`);
    console.log(`  expr: "${expr}"`);
    console.log(`  tokens: ${tokens.slice(0, -1).map(t => `${t.type}`).join(' ')}`);
    
    try {
      const ast = parse(expr);
      console.log(`  parsed OK`);
    } catch (e) {
      console.log(`  parse error: ${e.message.substring(0, 80)}`);
    }
  } catch (e) {
    console.log(`✗ TOKENIZE ERROR: ${label}`);
    console.log(`  expr: "${expr}"`);
    console.log(`  error: ${e.message}`);
  }
  console.log();
});
