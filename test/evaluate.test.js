import test from 'node:test';
import assert from 'node:assert/strict';

import { parse } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';
import { makeRootContext } from '../src/context.js';
import { XPathTypeError } from '../src/errors.js';
import { adapter, doc, element } from './helpers/dom.js';

function evalExpr(expr) {
  const document = doc(element('root'));
  return evaluate(parse(expr), makeRootContext(document, adapter));
}

test('arithmetic', () => {
  assert.equal(evalExpr('1 + 2'), 3);
  assert.equal(evalExpr('2 * 3 + 1'), 7);
  assert.equal(evalExpr('1 + 2 * 3'), 7);
  assert.equal(evalExpr('6 div 4'), 1.5);
  assert.equal(evalExpr('7 mod 3'), 1);
  assert.equal(evalExpr('5 mod -3'), 2); // truncating remainder, sign of dividend
  assert.equal(evalExpr('-5 mod 3'), -2);
  assert.equal(evalExpr('(1 + 2) * 3'), 9);
});

test('unary minus', () => {
  assert.equal(evalExpr('-3'), -3);
  assert.equal(evalExpr('- -3'), 3);
});

test('division by zero yields IEEE infinities / NaN', () => {
  assert.equal(evalExpr('1 div 0'), Infinity);
  assert.equal(evalExpr('-1 div 0'), -Infinity);
  assert.ok(Number.isNaN(evalExpr('0 div 0')));
});

test('boolean logic short-circuits', () => {
  assert.equal(evalExpr('1 = 1 and 2 = 2'), true);
  assert.equal(evalExpr('1 = 2 and 2 = 2'), false);
  assert.equal(evalExpr('1 = 2 or 3 = 3'), true);
  assert.equal(evalExpr('1 = 2 or 3 = 4'), false);
});

test('comparisons', () => {
  assert.equal(evalExpr('3 > 2'), true);
  assert.equal(evalExpr('2 >= 2'), true);
  assert.equal(evalExpr('1 = 1'), true);
  assert.equal(evalExpr('1 != 2'), true);
  assert.equal(evalExpr("'a' = 'a'"), true);
  assert.equal(evalExpr("'a' = 'b'"), false);
});

test('string and number literals', () => {
  assert.equal(evalExpr("'hello'"), 'hello');
  assert.equal(evalExpr('42'), 42);
  assert.equal(evalExpr('3.14'), 3.14);
});

test('union of non-node-sets is a type error', () => {
  assert.throws(() => evalExpr('1 | 2'), XPathTypeError);
});

test('unknown functions are a type error', () => {
  // The core library is wired in Stage 4; until then unknown names throw.
  assert.throws(() => evalExpr('no_such_function()'), XPathTypeError);
});
