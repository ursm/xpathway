import { tokenize, T } from './src/lexer.js';
import { parse } from './src/parser.js';

// Per XPath spec:
// AbbreviatedStep ::= '.' | '..'
// AxisSpecifier ::= AxisName '::' | '@'
// So @ is an abbreviation for "attribute::" but it still goes through
// the full Step production which includes Predicate*
// 
// Actually, looking at REC §2.2:
// Step ::= AxisSpecifier NodeTest Predicate*
// AxisSpecifier ::= AxisName '::' | '@'
// 
// So "@name[predicate]" should indeed be valid!
// It's "attribute::name[predicate]" which is valid.

console.log('Per XPath 1.0 spec REC §2.2:');
console.log('  Step ::= AxisSpecifier NodeTest Predicate*');
console.log('  AxisSpecifier ::= AxisName \'::\'  | \'@\'');
console.log('');
console.log('So @name[1] is a valid step: select the first attribute named name');

const expr = '@a[1]';
const tokens = tokenize(expr);
console.log(`\nExpression: "${expr}"`);
console.log(`Tokens: ${tokens.slice(0, -1).map(t => t.type).join(' ')}`);

const ast = parse(expr);
console.log(`\nParsed AST (partial):`);
console.log(`  root: ${ast.root}`);
console.log(`  steps[0].axis: ${ast.steps[0].axis}`);
console.log(`  steps[0].nodeTest: ${JSON.stringify(ast.steps[0].nodeTest)}`);
console.log(`  steps[0].predicates: ${ast.steps[0].predicates.map(p => JSON.stringify(p))}`);
console.log('\nThis is CORRECT - attribute axis with name test and [1] predicate');
