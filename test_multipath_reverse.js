import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element } from './test/helpers/dom.js';

// Build: <root>
//   <a>
//     <x/>
//     <y/>
//     <z/>
//   </a>
//   <b>
//     <x/>
//   </b>
// </root>
const x1 = element('x');
const y = element('y');
const z = element('z');
const a = element('a', {}, [x1, y, z]);
const x2 = element('x');
const b = element('b', {}, [x2]);
const root = element('root', {}, [a, b]);
const docNode = doc(root);

function select(expr, contextNode = docNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  return value.ordered(adapter).map(n => {
    const name = adapter.localName(n);
    return name;
  });
}

console.log('Test: //x/ancestor::*[1] (parent of each x)');
const result1 = select('//x/ancestor::*[1]');
console.log('Result:', result1);
console.log('Expected: a (parent of x1), b (parent of x2)');

console.log('\nTest: //x/ancestor::*[2] (grandparent of each x)');
const result2 = select('//x/ancestor::*[2]');
console.log('Result:', result2);
console.log('Expected: root (grandparent of both x1 and x2)');

// This is critical: each x should get its own ancestor::* axis applied,
// then [1] predicate should filter to just the first (nearest) ancestor per x.
// Then the results are deduplicated. So we should get a, b (not deduplicated as root).
