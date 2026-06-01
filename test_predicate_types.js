import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element } from './test/helpers/dom.js';

// Build: <root>
//   <a><sub/></a>
//   <a/>
//   <a><sub/></a>
// </root>
const sub1 = element('sub');
const a1 = element('a', {}, [sub1]);
const a2 = element('a');
const sub3 = element('sub');
const a3 = element('a', {}, [sub3]);
const root = element('root', {}, [a1, a2, a3]);
const docNode = doc(root);

function select(expr, contextNode = docNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  return value.ordered(adapter).length;
}

console.log('Test 1: a[sub] returns 2 (a1, a3 have sub children)');
console.log('Count:', select('//a[sub]'));

console.log('\nTest 2: a[last()] returns 1 (only the last a)');
console.log('Count:', select('//a[last()]'));

console.log('\nTest 3: a[position()=last()] returns 1 (same as [last()])');
console.log('Count:', select('//a[position()=last()]'));

console.log('\nTest 4: a[position()>1] returns 2 (a2, a3, not a1)');
console.log('Count:', select('//a[position()>1]'));
