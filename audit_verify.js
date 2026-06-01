import { tokenize, T } from './src/lexer.js';
import { parse } from './src/parser.js';

// The expression "5 * * 5" should parse as (5) * (*) * (5)
// That is: NUMBER MULTIPLY MULTIPLY NUMBER
// The second * should be a MULTIPLY operator because after MULTIPLY 
// (which is in FORCE_NAME_AFTER), we're in NAME position, so * becomes NAMETEST.

// Wait, let me re-read the spec. REC §3.7 rule 1:
// "If there is a preceding token and it is NOT one of `@`, `::`, `(`, `[`, 
//  `,` or an Operator, then a `*` is a MultiplyOperator"
//
// So after MULTIPLY (which IS an operator), the rule says the second * should
// NOT be MultiplyOperator, so it becomes a NAMETEST (name test for wildcard).
// The tokenization is ACTUALLY CORRECT!

console.log('Per spec rule 1:');
console.log('  after an Operator (including MULTIPLY), * is NOT a MultiplyOperator');
console.log('  so it becomes a NAMETEST (wildcard name test)');
console.log('');

const expr = '5 * * 5';
const tokens = tokenize(expr);
console.log(`Expression: "${expr}"`);
console.log(`Tokens: ${tokens.slice(0, -1).map(t => t.type).join(' ')}`);
console.log('');
console.log('This means: 5 * (*) * 5 -> (multiply 5 (multiply * 5))');
console.log('Which is valid XPath: multiply the number 5 by the wildcard node test');

// But wait - * by itself is not a valid expression in a primary context
// Can you multiply a number by a node test? Let me try to parse it
try {
  const ast = parse(expr);
  console.log('\nParse succeeded - AST:');
  console.log(JSON.stringify(ast, null, 2));
} catch (e) {
  console.log(`\nParse error: ${e.message}`);
}
