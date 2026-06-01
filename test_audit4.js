import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element } from './test/helpers/dom.js';

// Build: <root>
//   <a><b/></a>
//   <a></a>
//   <a><b/></a>
// </root>
const b1 = element('b');
const a1 = element('a', {}, [b1]);
const a2 = element('a');
const b3 = element('b');
const a3 = element('a', {}, [b3]);
const root = element('root', {}, [a1, a2, a3]);
const docNode = doc(root);

function label(n) {
  return adapter.localName(n);
}

function select(expr, contextNode = docNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  return value.ordered(adapter).map(label);
}

console.log('Test 1: a[b] - keep a if child b exists (node-set predicate as boolean)');
const result1 = select('//a[b]');
console.log('Result:', result1);
console.log('Expected: a, a (first and third a have b children)');

console.log('\nTest 2: a[last()] - keep a if position equals size');
const result2 = select('//a[last()]');
console.log('Result:', result2);
console.log('Expected: a (third/last a)');

console.log('\nTest 3: a[position()=last()] - same as [last()]');
const result3 = select('//a[position()=last()]');
console.log('Result:', result3);
console.log('Expected: a (third/last a)');
