import { tokenize, T } from './src/lexer.js';

// Test the "div div div" case in detail
const expr = 'div div div';
const tokens = tokenize(expr);

console.log(`Expression: "${expr}"`);
console.log(`Tokens:`);
tokens.slice(0, -1).forEach((t, i) => {
  console.log(`  [${i}] type: ${t.type}, value: ${JSON.stringify(t.value)}`);
});

console.log('\nExpected per spec: DIV DIV DIV');
console.log('  First "div" at start -> inOperatorPosition()=false -> NAMETEST (correct)');
console.log('  Second "div" after NAMETEST -> inOperatorPosition()=true -> should be DIV');
console.log('  Third "div" after DIV -> inOperatorPosition()=false -> should be NAMETEST');

const expr2 = 'a div b div c';
const tokens2 = tokenize(expr2);
console.log(`\n\nExpression: "${expr2}"`);
console.log(`Tokens:`);
tokens2.slice(0, -1).forEach((t, i) => {
  console.log(`  [${i}] type: ${t.type}, value: ${JSON.stringify(t.value)}`);
});

console.log('\nExpected: NAMETEST DIV NAMETEST DIV NAMETEST');
