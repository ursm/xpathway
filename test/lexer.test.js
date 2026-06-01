'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';

import { tokenize, T } from '../src/lexer.js';
import { XPathSyntaxError } from '../src/errors.js';

// Strip positions; compare on (type, value) only.
function types(expr) {
  return tokenize(expr).slice(0, -1).map((t) => t.type);
}

function values(expr) {
  return tokenize(expr).slice(0, -1).map((t) => [t.type, t.value]);
}

test('simple operators and punctuation', () => {
  assert.deepEqual(types('//a/b'), [T.DOUBLESLASH, T.NAMETEST, T.SLASH, T.NAMETEST]);
  assert.deepEqual(types('a | b'), [T.NAMETEST, T.PIPE, T.NAMETEST]);
  assert.deepEqual(types('@id'), [T.AT, T.NAMETEST]);
});

test('multi-character comparison operators', () => {
  assert.deepEqual(types('a != b'), [T.NAMETEST, T.NE, T.NAMETEST]);
  assert.deepEqual(types('a <= b'), [T.NAMETEST, T.LE, T.NAMETEST]);
  assert.deepEqual(types('a >= b'), [T.NAMETEST, T.GE, T.NAMETEST]);
  assert.deepEqual(types('a < b'), [T.NAMETEST, T.LT, T.NAMETEST]);
});

test('star is multiply in operator position, name test otherwise', () => {
  // `*` after a name test value -> multiply.
  assert.deepEqual(types('3 * 4'), [T.NUMBER, T.MULTIPLY, T.NUMBER]);
  assert.deepEqual(types('price * 2'), [T.NAMETEST, T.MULTIPLY, T.NUMBER]);
  // `*` at start, or after `/`, `@`, `(`, `,`, `::` -> name test.
  assert.deepEqual(types('*'), [T.NAMETEST]);
  assert.deepEqual(types('//*'), [T.DOUBLESLASH, T.NAMETEST]);
  assert.deepEqual(types('child::*'), [T.AXISNAME, T.DOUBLECOLON, T.NAMETEST]);
  assert.deepEqual(types('@*'), [T.AT, T.NAMETEST]);
});

test('and/or/mod/div are operators only in operator position', () => {
  assert.deepEqual(types('a and b'), [T.NAMETEST, T.AND, T.NAMETEST]);
  assert.deepEqual(types('a or b'), [T.NAMETEST, T.OR, T.NAMETEST]);
  assert.deepEqual(types('7 mod 3'), [T.NUMBER, T.MOD, T.NUMBER]);
  assert.deepEqual(types('7 div 2'), [T.NUMBER, T.DIV, T.NUMBER]);
  // As the first token (no preceding token) they are name tests.
  assert.deepEqual(types('and'), [T.NAMETEST]);
  assert.deepEqual(types('div'), [T.NAMETEST]);
  // After `/` they are name tests, not operators.
  assert.deepEqual(types('//div'), [T.DOUBLESLASH, T.NAMETEST]);
});

test('node types vs function names vs name tests (followed by paren)', () => {
  assert.deepEqual(types('text()'), [T.NODETYPE, T.LPAREN, T.RPAREN]);
  assert.deepEqual(types('node()'), [T.NODETYPE, T.LPAREN, T.RPAREN]);
  assert.deepEqual(types('count(a)'), [T.FUNCNAME, T.LPAREN, T.NAMETEST, T.RPAREN]);
  // `processing-instruction('x')`
  assert.deepEqual(types("processing-instruction('x')"), [T.NODETYPE, T.LPAREN, T.LITERAL, T.RPAREN]);
});

test('axis names (followed by ::)', () => {
  assert.deepEqual(types('ancestor::node()'), [T.AXISNAME, T.DOUBLECOLON, T.NODETYPE, T.LPAREN, T.RPAREN]);
  assert.deepEqual(values('following-sibling::x')[0], [T.AXISNAME, 'following-sibling']);
});

test('name tests with prefixes and wildcards', () => {
  assert.deepEqual(values('svg:rect'), [[T.NAMETEST, { prefix: 'svg', local: 'rect' }]]);
  assert.deepEqual(values('svg:*'), [[T.NAMETEST, { prefix: 'svg', local: '*' }]]);
  assert.deepEqual(values('*'), [[T.NAMETEST, { prefix: null, local: '*' }]]);
});

test('numbers', () => {
  assert.deepEqual(values('42'), [[T.NUMBER, 42]]);
  assert.deepEqual(values('3.14'), [[T.NUMBER, 3.14]]);
  assert.deepEqual(values('.5'), [[T.NUMBER, 0.5]]);
  assert.deepEqual(values('10.'), [[T.NUMBER, 10]]);
});

test('dot and dotdot vs number', () => {
  assert.deepEqual(types('.'), [T.DOT]);
  assert.deepEqual(types('..'), [T.DOTDOT]);
  assert.deepEqual(types('./a'), [T.DOT, T.SLASH, T.NAMETEST]);
  // A trailing decimal point on an integer must not swallow the first `.` of `..`.
  assert.deepEqual(values('1..2'), [[T.NUMBER, 1], [T.DOTDOT, '..'], [T.NUMBER, 2]]);
  assert.deepEqual(values('10.'), [[T.NUMBER, 10]]);
});

test('string literals with both quote styles', () => {
  assert.deepEqual(values('"hello"'), [[T.LITERAL, 'hello']]);
  assert.deepEqual(values("'world'"), [[T.LITERAL, 'world']]);
  assert.deepEqual(values('"it\'s"'), [[T.LITERAL, "it's"]]);
});

test('variable references tokenize (rejected later by parser)', () => {
  assert.deepEqual(values('$foo'), [[T.VARREF, 'foo']]);
});

test('errors', () => {
  assert.throws(() => tokenize('"unterminated'), XPathSyntaxError);
  assert.throws(() => tokenize('a ! b'), XPathSyntaxError);
  assert.throws(() => tokenize('#'), XPathSyntaxError);
});
