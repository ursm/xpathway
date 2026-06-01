import { parse } from './src/parser.js';
import { evaluate } from './src/evaluate.js';
import { makeRootContext } from './src/context.js';
import { adapter, doc, element } from './test/helpers/dom.js';

// Build: <root><a/></root>
const a = element('a');
const root = element('root', {}, [a]);
const docNode = doc(root);

function select(expr, contextNode = docNode) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter));
  if (!Array.isArray(value.nodes)) throw new Error('not a nodeset');
  return value.ordered(adapter).length;
}

console.log('Test 1: //a (should be 1)');
console.log(select('//a'));

console.log('\nTest 2: //a/parent::* (should be 1 - root)');
console.log(select('//a/parent::*'));

console.log('\nTest 3: //a/parent::*/child::a (should be 1 - a again, back through root)');
console.log(select('//a/parent::*/child::a'));

console.log('\nTest 4: //a/preceding-sibling::* (should be 0 - a has no preceding siblings)');
console.log(select('//a/preceding-sibling::*'));

console.log('\nTest 5: //a/ancestor::* (should be 1 - root)');
console.log(select('//a/ancestor::*'));

console.log('\nTest 6: //a/ancestor::*[1] (should be 1 - root, position 1 of ancestors)');
console.log(select('//a/ancestor::*[1]'));
