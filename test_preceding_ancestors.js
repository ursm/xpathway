import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element } from './test/helpers/dom.js';

// Build: <root>
//   <div>
//     <a/>
//     <b/>
//   </div>
//   <section>
//     <c/>
//     <d/>
//   </section>
// </root>
const a = element('a');
const b = element('b');
const div = element('div', {}, [a, b]);
const c = element('c');
const d = element('d');
const section = element('section', {}, [c, d]);
const root = element('root', {}, [div, section]);
const docNode = doc(root);

function label(n) {
  return adapter.localName(n);
}

function select(expr, contextNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  return value.ordered(adapter).map(label);
}

// The preceding axis from d includes all nodes that are:
// - descendants of ancestors of d
// - AND come before d in document order
// So: root (ancestor), div (sibling of section, ancestor of d),
//     a, b (descendants of div and previous siblings of d's ancestors)

console.log('Ancestors of d:', select('ancestor::*', d));
console.log('Preceding from d:', select('preceding::*', d));
console.log('Expected: div, a, b (all previous to d and descendants of its ancestors)');

// The spec says: preceding axis contains all nodes that are descendants of 
// the ancestors of the context node and that come before the context node 
// in document order, EXCLUDING the context node itself and ancestors

console.log('\nPreceding should EXCLUDE ancestors like root or section');
