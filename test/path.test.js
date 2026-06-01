import test from 'node:test';
import assert from 'node:assert/strict';

import { parse } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';
import { makeRootContext } from '../src/context.js';
import { isNodeSet } from '../src/types.js';
import { adapter, doc, element, text, comment, XHTML_NS } from './helpers/dom.js';

// Fixture:
//   <root>
//     <a id="a1">A1<b>B1</b></a>
//     <a id="a2"><b>B2</b><c/></a>
//     <!--note-->
//     <d><e><f/></e></d>
//   </root>
function build() {
  const b1 = element('b', {}, [text('B1')]);
  const a1 = element('a', { id: 'a1' }, [text('A1'), b1]);
  const b2 = element('b', {}, [text('B2')]);
  const c = element('c');
  const a2 = element('a', { id: 'a2' }, [b2, c]);
  const note = comment('note');
  const f = element('f');
  const e = element('e', {}, [f]);
  const d = element('d', {}, [e]);
  const root = element('root', {}, [a1, a2, note, d]);
  const document = doc(root);
  return { document, root, a1, a2, b1, b2, c, note, d, e, f };
}

const fx = build();

function label(n) {
  switch (adapter.nodeType(n)) {
    case 1: {
      const id = adapter.getAttribute(n, null, 'id');
      return adapter.localName(n) + (id ? `#${id}` : '');
    }
    case 2:
      return `@${adapter.localName(n)}=${n.value}`;
    case 3:
      return `"${n.value}"`;
    case 8:
      return `<!--${n.value}-->`;
    default:
      return adapter.nodeName(n) ?? '?';
  }
}

function select(expr, contextNode = fx.document, opts) {
  const value = evaluate(parse(expr), makeRootContext(contextNode, adapter, opts));
  assert.ok(isNodeSet(value), `expected a node-set from ${expr}`);
  return value.ordered(adapter);
}

function labels(expr, contextNode, opts) {
  return select(expr, contextNode, opts).map(label);
}

test('child axis', () => {
  assert.deepEqual(labels('/root/a'), ['a#a1', 'a#a2']);
  assert.deepEqual(labels('/root/node()'), ['a#a1', 'a#a2', '<!--note-->', 'd']);
});

test('descendant and descendant-or-self', () => {
  assert.deepEqual(labels('//b'), ['b', 'b']);
  assert.deepEqual(labels('//f'), ['f']);
  assert.deepEqual(labels('/root/descendant-or-self::a'), ['a#a1', 'a#a2']);
});

test('parent and ..', () => {
  assert.deepEqual(labels('..', fx.b1), ['a#a1']);
  assert.deepEqual(labels('parent::*', fx.f), ['e']);
});

test('ancestor / ancestor-or-self order via predicate (reverse axis)', () => {
  // Final node-set is materialised in document order...
  assert.deepEqual(labels('ancestor::*', fx.f), ['root', 'd', 'e']);
  // ...but proximity position is reverse document order (nearest = 1).
  assert.deepEqual(labels('ancestor::*[1]', fx.f), ['e']);
  assert.deepEqual(labels('ancestor::*[2]', fx.f), ['d']);
  assert.deepEqual(labels('ancestor-or-self::*[1]', fx.f), ['f']);
});

test('following-sibling and preceding-sibling', () => {
  assert.deepEqual(labels('following-sibling::*', fx.a1), ['a#a2', 'd']);
  assert.deepEqual(labels('preceding-sibling::*', fx.d), ['a#a1', 'a#a2']);
  assert.deepEqual(labels('preceding-sibling::*[1]', fx.d), ['a#a2']); // nearest
});

test('following and preceding axes', () => {
  assert.deepEqual(labels('following::*', fx.a1), ['a#a2', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(labels('preceding::*', fx.c), ['a#a1', 'b', 'b']); // a1, b1, b2 in doc order
  assert.deepEqual(labels('preceding::*[1]', fx.c), ['b']); // nearest preceding (b2)
});

test('attribute axis', () => {
  assert.deepEqual(labels('@id', fx.a1), ['@id=a1']);
  assert.deepEqual(labels('/root/a/@id'), ['@id=a1', '@id=a2']);
  assert.deepEqual(labels('/root/a/@*'), ['@id=a1', '@id=a2']);
});

test('self and .', () => {
  assert.deepEqual(labels('.', fx.b1), ['b']);
  assert.deepEqual(labels('self::b', fx.b1), ['b']);
  assert.deepEqual(labels('self::a', fx.b1), []);
});

test('node tests: text(), comment(), node()', () => {
  assert.deepEqual(labels('/root/a[1]/text()'), ['"A1"']);
  assert.deepEqual(labels('/root/comment()'), ['<!--note-->']);
  assert.deepEqual(labels('//text()'), ['"A1"', '"B1"', '"B2"']);
});

test('numeric predicate vs filter — the //b[1] gotcha', () => {
  // //b[1] = each b that is the first b-child of its parent -> both.
  assert.deepEqual(labels('//b[1]'), ['b', 'b']);
  // (//b)[1] = the first b in the whole set -> one.
  assert.deepEqual(labels('(//b)[1]'), ['b']);
});

test('position() and last()', () => {
  assert.deepEqual(labels('/root/a[position() = 2]'), ['a#a2']);
  assert.deepEqual(labels('/root/a[last()]'), ['a#a2']);
  assert.deepEqual(labels('/root/a[position() < 2]'), ['a#a1']);
});

test('chained predicates', () => {
  assert.deepEqual(labels('/root/a[@id][2]'), ['a#a2']);
  assert.deepEqual(labels('//b[. = "B2"]'), ['b']);
});

test('union in document order', () => {
  assert.deepEqual(labels('//c | //b'), ['b', 'b', 'c']);
});

test('absolute root', () => {
  const rootSet = select('/');
  assert.equal(rootSet.length, 1);
  assert.equal(adapter.nodeType(rootSet[0]), 9); // document node
  assert.deepEqual(labels('/*'), ['root']);
});

// --- §6 HTML semantics -----------------------------------------------------

function buildHtml() {
  const span = element('span', {}, [text('hi')], { namespaceURI: XHTML_NS });
  const div = element('div', { title: 'x' }, [span], { namespaceURI: XHTML_NS });
  const html = element('html', {}, [div], { namespaceURI: XHTML_NS });
  const document = doc(html, { isHtml: true });
  return { document, html, div, span };
}

const html = buildHtml();

test('HTML: unprefixed element name tests are ASCII case-insensitive', () => {
  assert.deepEqual(labels('//div', html.document), ['div']);
  assert.deepEqual(labels('//DIV', html.document), ['div']);
  assert.deepEqual(labels('//Div', html.document), ['div']);
  assert.deepEqual(labels('//span', html.document), ['span']);
});

test('HTML: unprefixed attribute name tests are case-insensitive', () => {
  assert.deepEqual(labels('//div/@TITLE', html.document).map((s) => s.replace(/=.*/, '')), ['@title']);
});

test('XML documents keep name tests case-sensitive', () => {
  assert.deepEqual(labels('//a', fx.document), ['a#a1', 'a#a2']);
  assert.deepEqual(labels('//A', fx.document), []); // no case folding in XML
});

test('prefixed name tests resolve via the resolver (case-sensitive)', () => {
  const resolver = (p) => (p === 'h' ? XHTML_NS : null);
  assert.deepEqual(labels('//h:div', html.document, { resolver }), ['div']);
  assert.deepEqual(labels('//h:DIV', html.document, { resolver }), []); // prefixed stays case-sensitive
});

test('HTML case-folding does not leak into foreign (non-XHTML) content', () => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const rect = element('rect', {}, [], { namespaceURI: SVG_NS });
  const svg = element('svg', {}, [rect], { namespaceURI: SVG_NS });
  const div = element('div', {}, [svg], { namespaceURI: XHTML_NS });
  const document = doc(element('html', {}, [div], { namespaceURI: XHTML_NS }), { isHtml: true });

  // The XHTML div still folds case...
  assert.deepEqual(labels('//DIV', document), ['div']);
  // ...but an unprefixed test must NOT match the SVG-namespaced <rect>.
  assert.deepEqual(labels('//rect', document), []);
  assert.deepEqual(labels('//RECT', document), []);
  // A prefixed, resolver-bound test matches it, case-sensitively.
  const resolver = (p) => (p === 's' ? SVG_NS : null);
  assert.deepEqual(labels('//s:rect', document, { resolver }), ['rect']);
  assert.deepEqual(labels('//s:RECT', document, { resolver }), []);
});

test('unresolved namespace prefix is an error', () => {
  assert.throws(() => select('//z:foo', fx.document), /unresolved namespace prefix/);
});

test('namespace axis is empty (no namespace nodes modeled)', () => {
  assert.deepEqual(labels('namespace::*', fx.a1), []);
});

test('stack-safe on deeply nested documents', () => {
  let node = element('leaf');
  for (let i = 0; i < 5000; i++) node = element('n', {}, [node]);
  const deep = doc(node);
  assert.equal(select('//leaf', deep).length, 1);
  assert.equal(select('//n', deep).length, 5000);
  assert.equal(select('descendant-or-self::*', node).length, 5001); // outermost n + descendants
});
