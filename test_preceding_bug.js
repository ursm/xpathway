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

// Document order: root -> div -> a -> b -> section -> c -> d
console.log('Document order (using _order):');
console.log('root._order =', root._order);
console.log('div._order =', div._order);
console.log('a._order =', a._order);
console.log('b._order =', b._order);
console.log('section._order =', section._order);
console.log('c._order =', c._order);
console.log('d._order =', d._order);

function select(expr, contextNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  return value.ordered(adapter);
}

console.log('\nPreceding from d:');
const precedingD = select('preceding::*', d);
precedingD.forEach(n => {
  console.log('-', adapter.localName(n), '(order:', n._order, ')');
});

console.log('\nExpected: div, a, b, section (NOT c, since c comes after d)');
console.log('But got:', precedingD.map(n => adapter.localName(n)).join(', '));

// Actually, I think c is WRONG here.
// Let me trace the preceding axis logic:
// From d: ancestors are section, root
// Walk up to root, collecting previous siblings of each ancestor
//   - From d (not DOCUMENT): previous siblings of d are c
//   - From section: previous siblings of section are div
//     - div and its descendants: div, a, b
//   - From root: previous siblings of root are (none)
// So out = [c, div, a, b]
// Then sort and reverse -> [a, b, div, c]?
// But c comes AFTER d, so this is wrong!
