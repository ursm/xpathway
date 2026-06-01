import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element } from './test/helpers/dom.js';

// Build: <root/>
const root = element('root');
const docNode = doc(root);

function select(expr, contextNode = docNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  return value.ordered(adapter);
}

console.log('Test 1: / (document node)');
const result1 = select('/');
console.log('NodeType:', adapter.nodeType(result1[0]));
console.log('Expected: 9 (DOCUMENT)');

console.log('\nTest 2: /root (root element)');
const result2 = select('/root');
console.log('NodeType:', adapter.nodeType(result2[0]));
console.log('Expected: 1 (ELEMENT)');

console.log('\nTest 3: /*[1] (first child of document)');
const result3 = select('/*[1]');
console.log('Name:', adapter.localName(result3[0]));
console.log('Expected: root');

console.log('\nTest 4: ancestor::* from root (no ancestors)');
const result4 = select('ancestor::*', root);
console.log('Count:', result4.length);
console.log('Expected: 0');

console.log('\nTest 5: parent::* from root (no parent)');
const result5 = select('parent::*', root);
console.log('Count:', result5.length);
console.log('Expected: 0');

console.log('\nTest 6: descendant::* from root');
const result6 = select('descendant::*', root);
console.log('Count:', result6.length);
console.log('Expected: 0 (root has no children)');
