import { parse } from './src/parser.js';

const tests = [
  'a div b div c',
  'div div div',
  'a and b and c',
];

tests.forEach(expr => {
  console.log(`Expression: "${expr}"`);
  try {
    const ast = parse(expr);
    console.log(`Parse OK`);
    console.log(JSON.stringify(ast, null, 2));
  } catch (e) {
    console.log(`Parse ERROR: ${e.message}`);
  }
  console.log();
});
