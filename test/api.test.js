import test from 'node:test';
import assert from 'node:assert/strict';

import { createEvaluator, XPathResult } from '../src/api.js';
import { adapter, doc, element, text, XHTML_NS } from './helpers/dom.js';

const fixture = doc(element('root', {}, [
  element('item', { id: 'i1' }, [text('alpha')]),
  element('item', { id: 'i2' }, [text('beta')]),
  element('item', { id: 'i3' }, [text('gamma')]),
]));

function newEvaluator(options) {
  return createEvaluator(adapter, options);
}

test('XPathResult exposes the DOM type constants on class and instance', () => {
  assert.equal(XPathResult.NUMBER_TYPE, 1);
  assert.equal(XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, 7);
  assert.equal(XPathResult.FIRST_ORDERED_NODE_TYPE, 9);
  const r = newEvaluator().evaluate('1', fixture, null, XPathResult.NUMBER_TYPE);
  assert.equal(r.ORDERED_NODE_SNAPSHOT_TYPE, 7);
});

test('primitive result types', () => {
  const ev = newEvaluator();
  assert.equal(ev.evaluate('1 + 2', fixture, null, XPathResult.NUMBER_TYPE).numberValue, 3);
  assert.equal(ev.evaluate("concat('a','b')", fixture, null, XPathResult.STRING_TYPE).stringValue, 'ab');
  assert.equal(ev.evaluate('count(//item) = 3', fixture, null, XPathResult.BOOLEAN_TYPE).booleanValue, true);
});

test('ANY_TYPE picks the natural result type', () => {
  const ev = newEvaluator();
  assert.equal(ev.evaluate('1 + 2', fixture, null, XPathResult.ANY_TYPE).resultType, XPathResult.NUMBER_TYPE);
  assert.equal(ev.evaluate("'x'", fixture, null, XPathResult.ANY_TYPE).resultType, XPathResult.STRING_TYPE);
  assert.equal(ev.evaluate('true()', fixture, null, XPathResult.ANY_TYPE).resultType, XPathResult.BOOLEAN_TYPE);
  assert.equal(
    ev.evaluate('//item', fixture, null, XPathResult.ANY_TYPE).resultType,
    XPathResult.UNORDERED_NODE_ITERATOR_TYPE,
  );
});

test('snapshot result (the capybara consumption path: type 7)', () => {
  const r = newEvaluator().evaluate('//item', fixture, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
  assert.equal(r.snapshotLength, 3);
  const names = [];
  for (let i = 0; i < r.snapshotLength; i++) {
    names.push(adapter.getAttribute(r.snapshotItem(i), null, 'id'));
  }
  assert.deepEqual(names, ['i1', 'i2', 'i3']); // document order
  assert.equal(r.snapshotItem(99), null);
});

test('iterator result', () => {
  const r = newEvaluator().evaluate('//item', fixture, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE);
  assert.equal(r.invalidIteratorState, false);
  const ids = [];
  let n;
  while ((n = r.iterateNext()) !== null) ids.push(adapter.getAttribute(n, null, 'id'));
  assert.deepEqual(ids, ['i1', 'i2', 'i3']);
  assert.equal(r.iterateNext(), null); // exhausted
});

test('first-ordered-node and any-unordered-node', () => {
  const ev = newEvaluator();
  const first = ev.evaluate('//item', fixture, null, XPathResult.FIRST_ORDERED_NODE_TYPE);
  assert.equal(adapter.getAttribute(first.singleNodeValue, null, 'id'), 'i1');
  const any = ev.evaluate('//item', fixture, null, XPathResult.ANY_UNORDERED_NODE_TYPE);
  assert.ok(any.singleNodeValue);
  const none = ev.evaluate('//nothing', fixture, null, XPathResult.FIRST_ORDERED_NODE_TYPE);
  assert.equal(none.singleNodeValue, null);
});

test('accessing the wrong result property throws a TYPE_ERR', () => {
  const r = newEvaluator().evaluate('1', fixture, null, XPathResult.NUMBER_TYPE);
  assert.throws(() => r.stringValue, TypeError);
  assert.throws(() => r.snapshotLength, TypeError);
  assert.throws(() => r.iterateNext(), TypeError);
});

test('requesting a node-set type for a non-node-set result is a TYPE_ERR', () => {
  assert.throws(
    () => newEvaluator().evaluate('1 + 1', fixture, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE),
    TypeError,
  );
});

test('grammar errors surface as SyntaxError', () => {
  assert.throws(() => newEvaluator().evaluate('a/', fixture, null, XPathResult.ANY_TYPE), SyntaxError);
});

test('exception constructors can be injected (host DOMException parity)', () => {
  class FakeDOMException extends Error {
    constructor(message, name) {
      super(message);
      this.name = name;
    }
  }
  const ev = newEvaluator({
    exceptions: {
      syntaxError: (m) => new FakeDOMException(m, 'SyntaxError'),
      typeError: (m) => new FakeDOMException(m, 'TypeError'),
    },
  });
  assert.throws(() => ev.evaluate('a/', fixture, null, 0), (e) => e instanceof FakeDOMException && e.name === 'SyntaxError');
  assert.throws(
    () => ev.evaluate('1', fixture, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE),
    (e) => e instanceof FakeDOMException && e.name === 'TypeError',
  );
});

test('createExpression reuses a parsed expression across context nodes', () => {
  const ev = newEvaluator();
  const expr = ev.createExpression('string(.)', null);
  const items = fixture.documentElement.childNodes;
  const values = items.map((it) => expr.evaluate(it, XPathResult.STRING_TYPE).stringValue);
  assert.deepEqual(values, ['alpha', 'beta', 'gamma']);
});

test('createNSResolver resolves xmlns declarations and the xml prefix', () => {
  const inner = element('s:rect', {}, [], { namespaceURI: 'urn:svg' });
  const host = element('host', { 'xmlns:s': 'urn:svg' }, [inner]);
  const document = doc(host);
  const ev = newEvaluator();
  const resolver = ev.createNSResolver(host);
  assert.equal(resolver.lookupNamespaceURI('s'), 'urn:svg');
  assert.equal(resolver.lookupNamespaceURI('xml'), 'http://www.w3.org/XML/1998/namespace');
  assert.equal(resolver.lookupNamespaceURI('missing'), null);
  // And the resolver drives prefixed name tests through document.evaluate.
  const r = ev.evaluate('//s:rect', document, resolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
  assert.equal(r.snapshotLength, 1);
});

test('HTML documents fold case through the public API', () => {
  const htmlDoc = doc(
    element('html', {}, [element('div', {}, [], { namespaceURI: XHTML_NS })], { namespaceURI: XHTML_NS }),
    { isHtml: true },
  );
  const r = newEvaluator().evaluate('//DIV', htmlDoc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
  assert.equal(r.snapshotLength, 1);
});
