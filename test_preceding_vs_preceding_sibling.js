import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element } from './test/helpers/dom.js';

// Build: <root>
//   <div>
//     <p/>
//     <q/>
//   </div>
//   <section>
//     <a/>
//     <b/>
//     <c/>
//   </section>
// </root>
const p = element('p');
const q = element('q');
const div = element('div', {}, [p, q]);
const a = element('a');
const b = element('b');
const c = element('c');
const section = element('section', {}, [a, b, c]);
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

console.log('From c:');
console.log('preceding::* = ', select('preceding::*', c));
console.log('Expected: div, p, q, section, a, b (all preceding nodes and their descendants)');

console.log('\npreceding-sibling::* = ', select('preceding-sibling::*', c));
console.log('Expected: a, b (only preceding siblings, not all preceding nodes)');

// Trace the spec:
// preceding: all nodes that are descendants of ancestors and come before context node
// preceding-sibling: all sibling nodes that come before context node

// From c:
// ancestors: section, root
// preceding (descendants of ancestors before c): div, p, q, section, a, b
//   - BUT wait, section is an ancestor, so excluded: div, p, q, a, b
// preceding-sibling (siblings before c): a, b

console.log('\nAh wait, I think preceding should exclude the ancestor section itself.');
console.log('Let me check the XPath spec more carefully...');

// According to XPath 1.0 REC §2.2:
// "the preceding axis contains all nodes that are descendants of the ancestors 
//  of the context node and that come before the context node in document order, 
//  excluding any ancestor of the context node"

// So from c:
// - ancestors: section, root
// - descendants of ancestors: div, p, q, section, a, b, c
// - that come before c: div, p, q, section, a, b
// - excluding ancestors: div, p, q, a, b (section and root are ancestors)

console.log('\nSo preceding::* should be: div, p, q, a, b (not section)');
