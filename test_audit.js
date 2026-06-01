import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element, text, comment } from './test/helpers/dom.js';

// Build: <r><a><b/></a><c><d/></c></r>
const b = element('b');
const a = element('a', {}, [b]);
const d = element('d');
const c = element('c', {}, [d]);
const r = element('r', {}, [a, c]);
const docNode = doc(r);

// Helper to get labels
function label(n) {
  const t = adapter.nodeType(n);
  if (t === 1) return adapter.localName(n);
  if (t === 3) return `"${n.value}"`;
  if (t === 8) return `<!--${n.value}-->`;
  return '?';
}

function select(expr, contextNode = docNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  return value.ordered(adapter).map(label);
}

console.log('Test 1: following::node() from b (should include text/comment, not attributes)');
console.log('following::node() from b:', select('following::node()', b));

console.log('\nTest 2: preceding::node() from d (should include text/comment, not attributes, not ancestors)');
console.log('preceding::node() from d:', select('preceding::node()', d));

console.log('\nTest 3: preceding::* from d (should be c, a, not ancestors)');
console.log('preceding::*[1] from d:', select('preceding::*[1]', d));

// Now test with text nodes
const withText = element('r', {}, [
  text('t1'),
  element('a', {}, [text('a-text')]),
  text('t2'),
  element('b', {}, [text('b-text')]),
  comment('note')
]);
const docWithText = doc(withText);

console.log('\nTest 4: following::node() from a (with text nodes)');
const aNode = withText.childNodes[1];
console.log('a node:', label(aNode));
console.log('following::node() from a:', select('following::node()', aNode));
