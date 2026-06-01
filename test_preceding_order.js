import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element } from './test/helpers/dom.js';

// Build: <root>
//   <div><a/><b/></div>
//   <section><c/><d/></section>
// </root>
const a = element('a');
const b = element('b');
const div = element('div', {}, [a, b]);
const c = element('c');
const d = element('d');
const section = element('section', {}, [c, d]);
const root = element('root', {}, [div, section]);
const docNode = doc(root);

function select(expr, contextNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  console.log('NodeSet.sorted flag:', value.sorted);
  return value;
}

console.log('Get preceding from d (should return NodeSet with sorted=false based on code):');
const preceding = select('preceding::*', d);
console.log('sorted flag:', preceding.sorted);
console.log('nodes:', preceding.nodes.map(n => ({
  name: adapter.localName(n),
  order: n._order
})));

// Now call ordered()
const ordered = preceding.ordered(adapter);
console.log('\nAfter ordered():');
console.log('sorted flag:', preceding.sorted);
console.log('ordered nodes:', ordered.map(n => ({
  name: adapter.localName(n),
  order: n._order
})));
