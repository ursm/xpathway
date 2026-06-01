import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element, text, comment } from './test/helpers/dom.js';

// Build: <root>
//   <a/>
//   <!--note-->
// </root>
const a = element('a');
const note = comment('note');
const root = element('root', {}, [a, note]);
const docNode = doc(root);

function label(n) {
  const t = adapter.nodeType(n);
  if (t === 1) return adapter.localName(n);
  if (t === 9) return 'document';
  if (t === 8) return `comment`;
  return '?';
}

function select(expr, contextNode = docNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  return value.ordered(adapter).map(label);
}

console.log('Test 1: /descendant::* from document (should include root and descendants, NOT document)');
const result1 = select('/descendant::*');
console.log('Result:', result1);
console.log('Expected: root, a');

console.log('\nTest 2: /descendant::node() from document (should include root, a, comment, NOT document)');
const result2 = select('/descendant::node()');
console.log('Result:', result2);
console.log('Expected: root, a, comment');

console.log('\nTest 3: descendant::* from root (should NOT include root itself, only descendants)');
const result3 = select('descendant::*', root);
console.log('Result:', result3);
console.log('Expected: a (not root)');

console.log('\nTest 4: descendant-or-self::* from root (should include root AND descendants)');
const result4 = select('descendant-or-self::*', root);
console.log('Result:', result4);
console.log('Expected: root, a');
