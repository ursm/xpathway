import test from 'node:test';
import assert from 'node:assert/strict';

import { NodeSet } from '../src/types.js';
import { compareEquality, compareRelational } from '../src/compare.js';
import { adapter, doc, element, text } from './helpers/dom.js';

// Builds a node-set of <v> elements whose string-values are the given strings.
function valueSet(...values) {
  const els = values.map((v) => element('v', {}, [text(v)]));
  doc(element('root', {}, els));
  return new NodeSet(els, true);
}

test('primitive equality follows boolean > number > string precedence', () => {
  assert.equal(compareEquality('=', 1, 1, adapter), true);
  assert.equal(compareEquality('=', '1', 1, adapter), true); // numeric compare
  assert.equal(compareEquality('=', '1', '1.0', adapter), false); // string compare
  assert.equal(compareEquality('=', true, 1, adapter), true); // boolean compare
  assert.equal(compareEquality('=', 'abc', 'abc', adapter), true);
  assert.equal(compareEquality('!=', 1, 2, adapter), true);
  assert.equal(compareEquality('!=', 1, 1, adapter), false);
});

test('node-set vs string is existential', () => {
  const ns = valueSet('1', '2', '3');
  assert.equal(compareEquality('=', ns, '2', adapter), true);
  assert.equal(compareEquality('=', ns, '5', adapter), false);
  // != is "exists a member that differs", NOT the negation of =.
  assert.equal(compareEquality('!=', ns, '2', adapter), true);
  assert.equal(compareEquality('!=', valueSet('2', '2'), '2', adapter), false);
});

test('node-set vs number is existential over numeric string-values', () => {
  const ns = valueSet('1', '2', '3');
  assert.equal(compareEquality('=', ns, 2, adapter), true);
  assert.equal(compareEquality('=', ns, 9, adapter), false);
});

test('node-set vs node-set is existential over string-value pairs', () => {
  assert.equal(compareEquality('=', valueSet('a', 'b'), valueSet('b', 'c'), adapter), true);
  assert.equal(compareEquality('=', valueSet('a'), valueSet('c'), adapter), false);
  assert.equal(compareEquality('!=', valueSet('a'), valueSet('c'), adapter), true);
});

test('node-set vs boolean compares booleans', () => {
  const empty = new NodeSet([]);
  const nonEmpty = valueSet('anything');
  assert.equal(compareEquality('=', nonEmpty, true, adapter), true);
  assert.equal(compareEquality('=', empty, false, adapter), true);
  assert.equal(compareEquality('=', empty, true, adapter), false);
});

test('relational comparisons are numeric and existential', () => {
  const ns = valueSet('1', '2', '3');
  assert.equal(compareRelational('>', ns, 2, adapter), true);
  assert.equal(compareRelational('<', ns, 1, adapter), false);
  assert.equal(compareRelational('>=', ns, 3, adapter), true);
  assert.equal(compareRelational('<', valueSet('1', '2'), valueSet('5'), adapter), true);
  assert.equal(compareRelational('>', valueSet('1'), valueSet('5'), adapter), false);
});
