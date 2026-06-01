import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element, text } from './test/helpers/dom.js';

// Build: <root attr="value">
//   some text
// </root>
const root = element('root', { attr: 'value' }, [text('some text')]);
const docNode = doc(root);

function select(expr, contextNode = docNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  return value.ordered(adapter).length;
}

console.log('Test 1: attribute::* on document (should return empty, not crash)');
try {
  const result1 = select('/attribute::*');
  console.log('Result: empty set, length =', result1);
  console.log('✓ No crash');
} catch (e) {
  console.log('✗ Error:', e.message);
}

console.log('\nTest 2: attribute::* on text node (should return empty, not crash)');
const textNode = root.childNodes[0];
try {
  const result2 = select('attribute::*', textNode);
  console.log('Result: empty set, length =', result2);
  console.log('✓ No crash');
} catch (e) {
  console.log('✗ Error:', e.message);
}

console.log('\nTest 3: attribute::* on element (should return attributes)');
try {
  const result3 = select('/root/attribute::*');
  console.log('Result: length =', result3);
  console.log('✓ Got attributes');
} catch (e) {
  console.log('✗ Error:', e.message);
}
