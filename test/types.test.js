import test from 'node:test';
import assert from 'node:assert/strict';

import { NodeSet, toBoolean, toNumber, toStr, numberToString, stringToNumber } from '../src/types.js';
import { adapter, doc, element, text } from './helpers/dom.js';

test('numberToString: integers and simple decimals', () => {
  assert.equal(numberToString(0), '0');
  assert.equal(numberToString(-0), '0');
  assert.equal(numberToString(1), '1');
  assert.equal(numberToString(-1), '-1');
  assert.equal(numberToString(100), '100');
  assert.equal(numberToString(1.5), '1.5');
  assert.equal(numberToString(0.5), '0.5');
  assert.equal(numberToString(-0.25), '-0.25');
  assert.equal(numberToString(1234.5678), '1234.5678');
});

test('numberToString: special values', () => {
  assert.equal(numberToString(NaN), 'NaN');
  assert.equal(numberToString(Infinity), 'Infinity');
  assert.equal(numberToString(-Infinity), '-Infinity');
});

test('numberToString: no exponential notation', () => {
  assert.equal(numberToString(1e21), '1000000000000000000000');
  assert.equal(numberToString(1e-7), '0.0000001');
  assert.equal(numberToString(-1.5e21), '-1500000000000000000000');
});

test('stringToNumber: valid and invalid forms', () => {
  assert.equal(stringToNumber('42'), 42);
  assert.equal(stringToNumber('  3.14 '), 3.14);
  assert.equal(stringToNumber('.5'), 0.5);
  assert.equal(stringToNumber('1.'), 1);
  assert.equal(stringToNumber('-2'), -2);
  assert.equal(stringToNumber('\t10\n'), 10);
  assert.ok(Number.isNaN(stringToNumber('')));
  assert.ok(Number.isNaN(stringToNumber('abc')));
  assert.ok(Number.isNaN(stringToNumber('1e3'))); // no exponent in XPath
  assert.ok(Number.isNaN(stringToNumber('0x10')));
  assert.ok(Number.isNaN(stringToNumber('1 2')));
  assert.ok(Number.isNaN(stringToNumber('+5'))); // no leading plus
});

test('toBoolean', () => {
  assert.equal(toBoolean(true), true);
  assert.equal(toBoolean(0), false);
  assert.equal(toBoolean(NaN), false);
  assert.equal(toBoolean(1), true);
  assert.equal(toBoolean(''), false);
  assert.equal(toBoolean('x'), true);
  assert.equal(toBoolean(new NodeSet([])), false);
  assert.equal(toBoolean(new NodeSet([{}])), true);
});

test('node-set conversions use string-value of the first node', () => {
  const num = element('n', {}, [text('42')]);
  const word = element('w', {}, [text('hello'), element('b', {}, [text('world')])]);
  doc(element('root', {}, [num, word]));

  assert.equal(toStr(new NodeSet([num]), adapter), '42');
  assert.equal(toNumber(new NodeSet([num]), adapter), 42);
  assert.equal(toStr(new NodeSet([word]), adapter), 'helloworld');
  assert.ok(Number.isNaN(toNumber(new NodeSet([word]), adapter)));
  assert.equal(toStr(new NodeSet([]), adapter), '');
});

test('toNumber / toStr of primitives', () => {
  assert.equal(toNumber(true, adapter), 1);
  assert.equal(toNumber(false, adapter), 0);
  assert.equal(toNumber('3.5', adapter), 3.5);
  assert.equal(toStr(true, adapter), 'true');
  assert.equal(toStr(false, adapter), 'false');
  assert.equal(toStr(2.5, adapter), '2.5');
});

test('NodeSet.first returns document-order first regardless of insertion order', () => {
  const a = element('a');
  const b = element('b');
  const c = element('c');
  doc(element('root', {}, [a, b, c]));
  const ns = new NodeSet([c, a, b], false);
  assert.equal(ns.first(adapter), a);
});
