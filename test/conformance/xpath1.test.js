import test from 'node:test';
import assert from 'node:assert/strict';

import { createEvaluator, XPathResult } from '../../src/api.js';
import { adapter, doc, element, text, comment } from '../helpers/dom.js';

// A small but varied catalog, exercising axes, predicates, functions, type
// coercion, and document order together (REC §2-§4).
//
//   <catalog>
//     <book id="b1" lang="en"><title>XPath</title><author>Alice</author><price>30</price></book>
//     <book id="b2" lang="fr"><title>XSLT</title><author>Bob</author><author>Carol</author><price>45</price></book>
//     <book id="b3"><title>DOM</title><price>20</price></book>
//     <!--end-->
//   </catalog>
function book(id, lang, title, authors, price) {
  const children = [element('title', {}, [text(title)])];
  for (const a of authors) children.push(element('author', {}, [text(a)]));
  children.push(element('price', {}, [text(String(price))]));
  const attrs = lang ? { id, lang } : { id };
  return element('book', attrs, children);
}

const catalog = doc(element('catalog', {}, [
  book('b1', 'en', 'XPath', ['Alice'], 30),
  book('b2', 'fr', 'XSLT', ['Bob', 'Carol'], 45),
  book('b3', null, 'DOM', [], 20),
  comment('end'),
]));

const ev = createEvaluator(adapter);

function snapshot(expr) {
  const r = ev.evaluate(expr, catalog, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
  const out = [];
  for (let i = 0; i < r.snapshotLength; i++) out.push(r.snapshotItem(i));
  return out;
}
const strings = (expr) => snapshot(expr).map((n) => adapter.stringValue(n));
const num = (expr) => ev.evaluate(expr, catalog, null, XPathResult.NUMBER_TYPE).numberValue;
const str = (expr) => ev.evaluate(expr, catalog, null, XPathResult.STRING_TYPE).stringValue;
const bool = (expr) => ev.evaluate(expr, catalog, null, XPathResult.BOOLEAN_TYPE).booleanValue;

test('aggregate number functions', () => {
  assert.equal(num('count(//book)'), 3);
  assert.equal(num('sum(//price)'), 95);
  assert.equal(num('count(//author)'), 3);
  assert.equal(num('count(//book[3]/author)'), 0);
});

test('predicates: comparison, position, count, existential', () => {
  assert.deepEqual(strings('//book[price > 25]/title'), ['XPath', 'XSLT']);
  assert.deepEqual(strings('//book[2]/author'), ['Bob', 'Carol']);
  assert.deepEqual(strings('//book[@id="b2"]/author[last()]'), ['Carol']);
  assert.deepEqual(strings('//book[count(author) > 1]/@id'), ['b2']);
  assert.deepEqual(strings('//book[author = "Bob"]/@id'), ['b2']); // node-set = string is existential
  assert.deepEqual(strings('//book/price[. < 25]'), ['20']);
});

test('boolean logic in predicates', () => {
  assert.deepEqual(strings('//book[price >= 30 and @lang = "en"]/@id'), ['b1']);
  assert.deepEqual(strings('//book[price > 1000 or @id = "b3"]/title'), ['DOM']);
  assert.equal(bool('boolean(//book[@id = "bX"])'), false);
  assert.equal(bool('boolean(//book[@id = "b1"])'), true);
});

test('navigation: parent, siblings, document order', () => {
  assert.deepEqual(strings('//title[. = "DOM"]/../@id'), ['b3']);
  assert.deepEqual(strings('//book[1]/following-sibling::book/@id'), ['b2', 'b3']);
  assert.deepEqual(strings('//book[3]/preceding-sibling::book[1]/@id'), ['b2']); // nearest
  assert.deepEqual(strings('//book[last()]/title'), ['DOM']);
});

test('string functions over nodes', () => {
  assert.equal(str('string(//book[1]/title)'), 'XPath');
  assert.equal(str('name(//book[1])'), 'book');
  assert.equal(str('concat(//book[1]/title, "-", //book[1]/author)'), 'XPath-Alice');
  assert.equal(str('translate(//book[1]/title, "XPath", "xpath")'), 'xpath');
  assert.deepEqual(strings('//book[starts-with(title, "X")]/@id'), ['b1', 'b2']);
  assert.equal(num('count(//book[contains(title, "X")])'), 2);
});

test('node tests and unions', () => {
  assert.equal(snapshot('//comment()').length, 1);
  assert.deepEqual(strings('//title | //price[. < 25]'), ['XPath', 'XSLT', 'DOM', '20']);
  assert.deepEqual(strings('//*[@lang = "fr"]/title'), ['XSLT']);
});

test('position() and last() interplay', () => {
  assert.deepEqual(strings('//book[position() = last()]/@id'), ['b3']);
  assert.deepEqual(strings('//book[position() != last()]/@id'), ['b1', 'b2']);
});

test('arithmetic, coercion, and number->string formatting', () => {
  assert.equal(num('7 div 2'), 3.5);
  assert.equal(num('5 mod 3'), 2);
  assert.equal(num('-5 mod 3'), -2); // truncating remainder, sign of dividend
  // number(node-set) coerces via string-value; arithmetic across the document.
  assert.equal(num('sum(//price) div count(//book)'), 95 / 3);
  // number -> string never uses exponential notation, and renders IEEE specials.
  assert.equal(str('string(1 div 4)'), '0.25');
  assert.equal(str('string(1 div 0)'), 'Infinity');
  assert.equal(str('string(-1 div 0)'), '-Infinity');
  assert.equal(str('string(0 div 0)'), 'NaN');
});
