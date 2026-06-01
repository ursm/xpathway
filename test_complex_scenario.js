import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element } from './test/helpers/dom.js';

// Build: <root>
//   <a id="a1"><x/><y/><z/></a>
//   <a id="a2"><x/></a>
//   <a id="a3"/>
// </root>
const x1 = element('x');
const y = element('y');
const z = element('z');
const a1 = element('a', { id: 'a1' }, [x1, y, z]);
const x2 = element('x');
const a2 = element('a', { id: 'a2' }, [x2]);
const a3 = element('a', { id: 'a3' });
const root = element('root', {}, [a1, a2, a3]);
const docNode = doc(root);

function select(expr, contextNode = docNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  const result = value.ordered(adapter);
  return result.map(n => {
    const name = adapter.localName(n);
    const id = adapter.getAttribute(n, null, 'id');
    return name + (id ? `#${id}` : '');
  });
}

console.log('Test: //a/preceding-sibling::a (all preceding a siblings of each a)');
const result1 = select('//a/preceding-sibling::a');
console.log('Result:', result1);
console.log('Expected: a#a1 (preceding of a2 and a3, but deduplicated to appear once)');

console.log('\nTest: //a/preceding-sibling::*[1] (nearest preceding sibling of each a)');
const result2 = select('//a/preceding-sibling::*[1]');
console.log('Result:', result2);
console.log('Expected: a#a1 (from a2), a#a2 (from a3)');

console.log('\nTest: //x/ancestor::a (parent a of each x)');
const result3 = select('//x/ancestor::a');
console.log('Result:', result3);
console.log('Expected: a#a1, a#a2 (deduplicated)');

console.log('\nTest: //x/ancestor::a[1] (nearest ancestor a of each x)');
const result4 = select('//x/ancestor::a[1]');
console.log('Result:', result4);
console.log('Expected: a#a1 (parent of x1), a#a2 (parent of x2)');
