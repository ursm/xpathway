import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element, text, comment } from './test/helpers/dom.js';

// Build: <root><a/> text <b/> comment <c/></root>
const a = element('a');
const textNode = text('text');
const b = element('b');
const commentNode = comment('comment');
const c = element('c');
const root = element('root', {}, [a, textNode, b, commentNode, c]);
const docNode = doc(root);

function label(n) {
  const t = adapter.nodeType(n);
  if (t === 1) return adapter.localName(n);
  if (t === 3) return `text:"${n.value}"`;
  if (t === 8) return `comment:"${n.value}"`;
  return '?';
}

function select(expr, contextNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  return value.ordered(adapter).map(label);
}

console.log('From a, following::node() should include text, b, comment, c:');
console.log(select('following::node()', a));

console.log('\nFrom a, following::* should include only b, c (not text, not comment):');
console.log(select('following::*', a));
