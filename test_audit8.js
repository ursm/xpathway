import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element } from './test/helpers/dom.js';

// Build: <root><a/><b/></root>
const a = element('a');
const b = element('b');
const root = element('root', {}, [a, b]);
const docNode = doc(root);

function select(expr, contextNode = docNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  return value.ordered(adapter);
}

console.log('Test 1: following::* from a (calls compareDocumentPosition + sort)');
try {
  const result = select('following::*', a);
  console.log('✓ Got result:', result.map(n => adapter.localName(n)));
} catch (e) {
  console.log('✗ Error:', e.message);
}

console.log('\nTest 2: preceding::* from b (calls compareDocumentPosition + reverse)');
try {
  const result = select('preceding::*', b);
  console.log('✓ Got result:', result.map(n => adapter.localName(n)));
} catch (e) {
  console.log('✗ Error:', e.message);
}

// Test union which dedupes and can reorder
console.log('\nTest 3: //a | //b (union then ordered)');
try {
  const result = select('//a | //b');
  console.log('✓ Got result:', result.map(n => adapter.localName(n)));
} catch (e) {
  console.log('✗ Error:', e.message);
}
