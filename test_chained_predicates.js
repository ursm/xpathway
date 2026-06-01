import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element } from './test/helpers/dom.js';

// Build: <root>
//   <item id="1"><sub>A</sub></item>
//   <item id="2"/>
//   <item id="3"><sub>B</sub></item>
//   <item id="4"><sub>C</sub></item>
// </root>
const sub1 = element('sub', {}, [element('text')]);
const item1 = element('item', { id: '1' }, [sub1]);
const item2 = element('item', { id: '2' });
const sub3 = element('sub');
const item3 = element('item', { id: '3' }, [sub3]);
const sub4 = element('sub');
const item4 = element('item', { id: '4' }, [sub4]);
const root = element('root', {}, [item1, item2, item3, item4]);
const docNode = doc(root);

function select(expr, contextNode = docNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  return value.ordered(adapter).map(n => {
    const id = adapter.getAttribute(n, null, 'id');
    return id || adapter.localName(n);
  });
}

console.log('Test: item[@id][sub] (items with id AND child sub)');
const result1 = select('//item[@id][sub]');
console.log('Result:', result1);
console.log('Expected: 1, 3, 4 (all have id and sub child)');

console.log('\nTest: item[@id][3] (3rd item with id)');
const result2 = select('//item[@id][3]');
console.log('Result:', result2);
console.log('Expected: 3 (only 3rd item in document has id - wait, all have id)');
console.log('Actually, all items have id, so [3] should give the 3rd item: item id=3');
