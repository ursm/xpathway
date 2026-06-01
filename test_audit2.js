import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element } from './test/helpers/dom.js';

// Build: <r><a><b><c><d/></c></b></a></r>
const d = element('d');
const c = element('c', {}, [d]);
const b = element('b', {}, [c]);
const a = element('a', {}, [b]);
const r = element('r', {}, [a]);
const docNode = doc(r);

function label(n) {
  return adapter.localName(n) || '?';
}

function select(expr, contextNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  return value.ordered(adapter).map(label);
}

console.log('Test: ancestor::*[1] from d should be c (nearest ancestor)');
console.log('ancestor::*[1] from d:', select('ancestor::*[1]', d));

console.log('\nTest: ancestor::*[2] from d should be b (second nearest)');
console.log('ancestor::*[2] from d:', select('ancestor::*[2]', d));

console.log('\nTest: ancestor-or-self::*[1] from d should be d (self is position 1)');
console.log('ancestor-or-self::*[1] from d:', select('ancestor-or-self::*[1]', d));

// Test multi-step with multiple input nodes
// <r><a1><f/></a1><a2><f/></a2></r>
const f1 = element('f');
const a1 = element('a1', {}, [f1]);
const f2 = element('f');
const a2 = element('a2', {}, [f2]);
const rMulti = element('r', {}, [a1, a2]);
const docMulti = doc(rMulti);

console.log('\nTest: //a1/following-sibling::*[1] should be a2');
console.log('//a1/following-sibling::*[1]:', select('//a1/following-sibling::*[1]', docMulti));

console.log('\nTest: //f[ancestor::*[2]] should get f elements whose grandparent is r');
const f1Node = a1.childNodes[0];
const f2Node = a2.childNodes[0];
const fResults = select('//f[ancestor::*[2]]', docMulti);
console.log('//f[ancestor::*[2]]:', fResults);
console.log('Expected: 2 f nodes (both have r as grandparent)');
