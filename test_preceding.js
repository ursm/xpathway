import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element } from './test/helpers/dom.js';

// Build: <root>
//   <a/>
//   <b/>
//   <c/>
//   <d/>
// </root>
const a = element('a');
const b = element('b');
const c = element('c');
const d = element('d');
const root = element('root', {}, [a, b, c, d]);
const docNode = doc(root);

function label(n) {
  return adapter.localName(n);
}

function select(expr, contextNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  return value.ordered(adapter).map(label);
}

// From XPath spec: preceding axis contains all nodes that are descendants 
// of the ancestors of the context node (excluding the context node itself, 
// its ancestors, and their following siblings)

console.log('Test: preceding::* from d should be a, b, c (previous siblings and their descendants)');
console.log('Result:', select('preceding::*', d));

console.log('\nTest: preceding::*[1] from d should be c (nearest preceding in axis order, which is reverse doc order)');
console.log('Result:', select('preceding::*[1]', d));

// Build a deeper tree
const x = element('x', {}, [element('x1'), element('x2')]);
const y = element('y');
const z = element('z', {}, [element('z1')]);
const deeper = element('root', {}, [x, y, z]);
const deepDoc = doc(deeper);

console.log('\nTest: preceding::* from z should be x, x1, x2, y (previous siblings and their descendants)');
console.log('Result:', select('preceding::*', z));

console.log('\nTest: preceding::*[1] from z (first in reverse document order = y, last in document order)');
console.log('Result:', select('preceding::*[1]', z));
