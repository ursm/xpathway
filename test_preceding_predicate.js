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
  return value.ordered(adapter).map(n => adapter.localName(n));
}

console.log('preceding::*[1] from d should be c (nearest preceding):');
console.log(select('preceding::*[1]', d));

console.log('\nAll preceding from d in axis order (should be c, b, a, div):');
// To see axis order, we need to NOT call ordered()
const value = evaluate(parse('preceding::*'), makeRootContext(d, adapter));
console.log('Axis order:', value.nodes.map(n => adapter.localName(n)));
