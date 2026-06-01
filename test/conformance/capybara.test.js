import test from 'node:test';
import assert from 'node:assert/strict';

import { createEvaluator, XPathResult } from '../../src/api.js';
import { adapter, doc, element, text, XHTML_NS } from '../helpers/dom.js';

// Regression fixtures for the *actual shapes* Capybara's `xpath` gem
// (XPath::Renderer / XPath::HTML) emits for field / button / link finders:
// `self::input | self::textarea | self::select` unions inside predicates,
// `not(...)` exclusions, `normalize-space(string(.))`, `contains(...)`, and the
// `@id = //label[...]/@for` label association. This is the parity bar (§8).
//
//   <form>
//     <label for="user">Username</label>
//     <input id="user" name="username" type="text"/>
//     <label>Password <input id="pass" name="password" type="password"/></label>
//     <input id="hidden1" name="secret" type="hidden"/>
//     <input id="submit1" type="submit" value="Log in"/>
//     <button type="button" id="btn1">Click me</button>
//     <a href="/home" id="home">Home</a>
//     <a href="/help" id="help" title="Help page">Help</a>
//     <a id="nohref">No href</a>
//   </form>
const h = (name, attrs = {}, children = []) => element(name, attrs, children, { namespaceURI: XHTML_NS });

const passInput = h('input', { id: 'pass', name: 'password', type: 'password' });
const page = doc(
  h('html', {}, [h('body', {}, [
    h('form', {}, [
      h('label', { for: 'user' }, [text('Username')]),
      h('input', { id: 'user', name: 'username', type: 'text' }),
      h('label', {}, [text('Password '), passInput]),
      h('input', { id: 'hidden1', name: 'secret', type: 'hidden' }),
      h('input', { id: 'submit1', type: 'submit', value: 'Log in' }),
      h('button', { type: 'button', id: 'btn1' }, [text('Click me')]),
      h('a', { href: '/home', id: 'home' }, [text('Home')]),
      h('a', { href: '/help', id: 'help', title: 'Help page' }, [text('Help')]),
      h('a', { id: 'nohref' }, [text('No href')]),
    ]),
  ])]),
  { isHtml: true },
);

const ev = createEvaluator(adapter);

function ids(expr, context = page) {
  const r = ev.evaluate(expr, context, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
  const out = [];
  for (let i = 0; i < r.snapshotLength; i++) out.push(adapter.getAttribute(r.snapshotItem(i), null, 'id'));
  return out;
}

const FIELD = '*[self::input | self::textarea | self::select]';
const NOT_BUTTONS = "not(./@type = 'submit' or ./@type = 'image' or ./@type = 'hidden')";

test('field finder: union-in-predicate + not() exclusions', () => {
  // All form fields except submit/image/hidden.
  assert.deepEqual(ids(`.//${FIELD}[${NOT_BUTTONS}]`), ['user', 'pass']);
  // By name.
  assert.deepEqual(ids(`.//${FIELD}[./@name = 'username']`), ['user']);
});

test('field finder: label association via @id = //label[...]/@for', () => {
  const byLabel = `.//${FIELD}[${NOT_BUTTONS}]`
    + `[./@id = //label[normalize-space(string(.)) = 'Username']/@for]`;
  assert.deepEqual(ids(byLabel), ['user']);
});

test('field finder: implicitly-labelled (input nested in a <label>)', () => {
  const nested = ".//label[contains(normalize-space(string(.)), 'Password')]//input";
  assert.deepEqual(ids(nested), ['pass']);
});

test('button finder: type set + value/id match', () => {
  const submit = ".//input[./@type = 'submit' or ./@type = 'reset' or ./@type = 'image' or ./@type = 'button']"
    + "[./@value = 'Log in' or ./@id = 'Log in']";
  assert.deepEqual(ids(submit), ['submit1']);
  // <button> matched by its text content.
  assert.deepEqual(ids(".//button[contains(normalize-space(string(.)), 'Click')]"), ['btn1']);
});

test('link finder: requires @href, matches text / title', () => {
  assert.deepEqual(ids(".//a[./@href]"), ['home', 'help']); // nohref excluded
  assert.deepEqual(ids(".//a[./@href][normalize-space(string(.)) = 'Home']"), ['home']);
  assert.deepEqual(ids(".//a[./@href][./@title = 'Help page']"), ['help']);
});

test('union of finders is returned in document order', () => {
  const expr = ".//a[normalize-space(string(.)) = 'Home'] | .//button[normalize-space(string(.)) = 'Click me']";
  assert.deepEqual(ids(expr), ['btn1', 'home']); // button precedes the link in the document
});

test('HTML case-insensitivity holds for the generated shapes', () => {
  // Capybara queries lower-case tag names; the document is HTML, so an
  // upper-case variant resolves identically.
  assert.deepEqual(ids(".//INPUT[./@name = 'username']"), ['user']);
});
