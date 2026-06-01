import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element, text } from './test/helpers/dom.js';

// Build: <root>
//   <a id="a1"><x/><y/><z/></a>
//   <a id="a2"><p/><q/></a>
// </root>
const x = element('x');
const y = element('y');
const z = element('z');
const a1 = element('a', { id: 'a1' }, [x, y, z]);
const p = element('p');
const q = element('q');
const a2 = element('a', { id: 'a2' }, [p, q]);
const root = element('root', {}, [a1, a2]);
const docNode = doc(root);

function label(n) {
  const name = adapter.localName(n);
  const id = adapter.getAttribute(n, null, 'id');
  return name + (id ? `#${id}` : '');
}

function select(expr, contextNode = docNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  return value.ordered(adapter).map(label);
}

console.log('Test: //a/following-sibling::*[1] (multi-input predicate per-node application)');
const result = select('//a/following-sibling::*[1]');
console.log('Result:', result);
console.log('Expected: y (from a1), q (from a2) in doc order');
console.log('Explanation: each a node should get its own first following-sibling');

// Another test: each element\'s first child
console.log('\nTest: //a/child::*[1] (should be first child of each a)');
const result2 = select('//a/child::*[1]');
console.log('Result:', result2);
console.log('Expected: x (first child of a1), p (first child of a2)');

// CRITICAL: Test that dedup still works across input nodes
console.log('\nTest: //a/ancestor::* (all ancestors of a1 and a2, deduped)');
const result3 = select('//a/ancestor::*');
console.log('Result:', result3);
console.log('Expected: root (deduplicated, appears once even though both a1 and a2 have it as ancestor)');
