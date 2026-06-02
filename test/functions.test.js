import test from 'node:test';
import assert from 'node:assert/strict';

import { parse } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';
import { makeRootContext } from '../src/context.js';
import { isNodeSet } from '../src/types.js';
import { adapter, doc, element, text } from './helpers/dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Fixture with numeric <m> elements, an <n> with non-numeric text, a namespaced
// element, two id-bearing <a>s, and an xml:lang subtree.
const span = element('span', {}, [text('hi')]);
const langEl = element('p', { 'xml:lang': 'en-US' }, [span]);
const rect = element('svg:rect', {}, [], { namespaceURI: SVG_NS });
const fixture = doc(element('root', {}, [
  element('m', {}, [text('10')]),
  element('m', {}, [text('20')]),
  element('m', {}, [text('30')]),
  element('n', {}, [text('  Hello   World  ')]),
  rect,
  element('a', { id: 'x1' }, [text('first')]),
  element('a', { id: 'x2' }, [text('second')]),
  langEl,
]));

function evalv(expr, node = fixture, opts) {
  return evaluate(parse(expr), makeRootContext(node, adapter, opts));
}

function ids(expr, node) {
  const v = evalv(expr, node);
  assert.ok(isNodeSet(v));
  return v.ordered(adapter).map((n) => adapter.getAttribute(n, null, 'id'));
}

// --- node-set functions ----------------------------------------------------

test('count', () => {
  assert.equal(evalv('count(//m)'), 3);
  assert.equal(evalv('count(//nothing)'), 0);
  assert.throws(() => evalv('count(1)'));
});

test('id', () => {
  assert.deepEqual(ids("id('x1')"), ['x1']);
  assert.deepEqual(ids("id('x1 x2')"), ['x1', 'x2']);
  // Tokens split on any XPath whitespace run; leading/trailing/repeated
  // whitespace yields no empty tokens.
  assert.deepEqual(ids("id('  x1\t\r\n x2  ')"), ['x1', 'x2']);
  // Result is materialised in document order regardless of token order.
  assert.deepEqual(ids("id('x2 x1')"), ['x1', 'x2']);
  assert.deepEqual(ids("id('missing')"), []);
});

test('local-name, namespace-uri, name', () => {
  assert.equal(evalv('local-name()', rect), 'rect');
  assert.equal(evalv('namespace-uri()', rect), SVG_NS);
  assert.equal(evalv('name()', rect), 'svg:rect');
  // No-name nodes yield ''.
  assert.equal(evalv('local-name()', span.childNodes[0]), '');
  // Argument form uses the first node in document order.
  assert.equal(evalv('local-name(//m)'), 'm');
});

// --- string functions ------------------------------------------------------

test('string', () => {
  assert.equal(evalv("string(42)"), '42');
  assert.equal(evalv('string(//m)'), '10'); // first node string-value
  assert.equal(evalv('string()', rect), ''); // context node string-value
});

test('concat / starts-with / contains', () => {
  assert.equal(evalv("concat('a', 'b', 'c')"), 'abc');
  assert.equal(evalv("starts-with('hello', 'he')"), true);
  assert.equal(evalv("starts-with('hello', 'lo')"), false);
  assert.equal(evalv("contains('hello', 'ell')"), true);
  assert.equal(evalv("contains('hello', 'x')"), false);
  assert.throws(() => evalv("concat('a')"));
});

test('substring-before / substring-after', () => {
  assert.equal(evalv("substring-before('1999/04/01', '/')"), '1999');
  assert.equal(evalv("substring-after('1999/04/01', '/')"), '04/01');
  assert.equal(evalv("substring-before('abc', 'x')"), '');
  assert.equal(evalv("substring-after('abc', 'x')"), '');
});

test('substring with rounding and infinities (REC §4.2 examples)', () => {
  assert.equal(evalv("substring('12345', 2)"), '2345');
  assert.equal(evalv("substring('12345', 2, 3)"), '234');
  assert.equal(evalv("substring('12345', 0, 3)"), '12');
  assert.equal(evalv("substring('12345', 1.5, 2.6)"), '234');
  assert.equal(evalv("substring('12345', 0 div 0, 3)"), '');
  assert.equal(evalv("substring('12345', 1, 0 div 0)"), '');
  assert.equal(evalv("substring('12345', -42, 1 div 0)"), '12345');
  assert.equal(evalv("substring('12345', -1 div 0, 1 div 0)"), '');
});

test('string-length / normalize-space', () => {
  assert.equal(evalv("string-length('hello')"), 5);
  assert.equal(evalv("normalize-space('  a  b  c  ')"), 'a b c');
  // Collapses every XPath whitespace kind (space/tab/CR/LF) and trims edges.
  assert.equal(evalv("normalize-space('\t a\r\n\tb \n')"), 'a b');
  assert.equal(evalv("normalize-space('   ')"), ''); // all whitespace -> empty
  assert.equal(evalv("normalize-space('abc')"), 'abc'); // already normalized
  // Non-XPath whitespace (NBSP) is NOT collapsed or trimmed (REC §3.7).
  assert.equal(evalv("normalize-space('\u00A0a\u00A0')"), '\u00A0a\u00A0');
  // No-arg form uses the context node string-value.
  assert.equal(evalv('normalize-space()', fixture.documentElement.childNodes[3]), 'Hello World');
});

test('translate', () => {
  assert.equal(evalv("translate('bar', 'abc', 'ABC')"), 'BAr');
  assert.equal(evalv("translate('--aaa--', 'abc-', 'ABC')"), 'AAA'); // '-' has no target -> removed
  assert.equal(evalv("translate('hello', 'el', 'ip')"), 'hippo');
});

// --- boolean functions -----------------------------------------------------

test('boolean / not / true / false', () => {
  assert.equal(evalv('boolean(1)'), true);
  assert.equal(evalv('boolean(0)'), false);
  assert.equal(evalv("boolean('')"), false);
  assert.equal(evalv('not(true())'), false);
  assert.equal(evalv('true()'), true);
  assert.equal(evalv('false()'), false);
});

test('lang', () => {
  // xml:lang on the ancestor <p> is "en-US".
  assert.equal(evalv("lang('en')", span), true); // prefix match
  assert.equal(evalv("lang('EN')", span), true); // case-insensitive
  assert.equal(evalv("lang('en-US')", span), true);
  assert.equal(evalv("lang('en-GB')", span), false);
  assert.equal(evalv("lang('de')", span), false);
  assert.equal(evalv("lang('en')", rect), false); // no xml:lang in scope
});

// --- number functions ------------------------------------------------------

test('number', () => {
  assert.equal(evalv("number('  3.14 ')"), 3.14);
  assert.ok(Number.isNaN(evalv("number('abc')")));
  assert.equal(evalv('number(true())'), 1);
  assert.equal(evalv('number(//m)'), 10); // first node string-value
});

test('sum', () => {
  assert.equal(evalv('sum(//m)'), 60);
  assert.equal(evalv('sum(//nothing)'), 0);
  assert.ok(Number.isNaN(evalv('sum(//n)'))); // non-numeric text -> NaN
  assert.throws(() => evalv('sum(1)'));
});

test('floor / ceiling / round', () => {
  assert.equal(evalv('floor(1.9)'), 1);
  assert.equal(evalv('floor(-1.1)'), -2);
  assert.equal(evalv('ceiling(1.1)'), 2);
  assert.equal(evalv('ceiling(-1.9)'), -1);
  assert.equal(evalv('round(2.5)'), 3);
  assert.equal(evalv('round(2.4)'), 2);
  assert.equal(evalv('round(-2.5)'), -2); // ties toward +infinity
});

test('functions compose with paths (Capybara-style)', () => {
  assert.equal(evalv("//a[contains(string(.), 'irst')]/@id != ''"), true);
  assert.equal(evalv("count(//a[starts-with(@id, 'x')])"), 2);
});
