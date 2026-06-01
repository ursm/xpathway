import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element } from './test/helpers/dom.js';

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

// Debug step-by-step
console.log('Step 1: //a gives us:');
const allA = select('//a');
console.log(allA);

console.log('\nStep 2: following-sibling::* from a1 should give: a2');
console.log('(context from a1):', select('following-sibling::*', a1));

console.log('\nStep 3: following-sibling::* from a2 should give: (none)');
console.log('(context from a2):', select('following-sibling::*', a2));

console.log('\nStep 4: following-sibling::*[1] from a1 should give: a2');
console.log('(context from a1):', select('following-sibling::*[1]', a1));

console.log('\nStep 5: following-sibling::*[1] from a2 should give: (none)');
console.log('(context from a2):', select('following-sibling::*[1]', a2));

console.log('\nFinal: //a/following-sibling::*[1] should give: a2 (from a1 only)');
const result = select('//a/following-sibling::*[1]');
console.log('Result:', result);
