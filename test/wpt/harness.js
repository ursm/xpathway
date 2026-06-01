// A tiny shim that lets vendored web-platform-tests XPath cases run, almost
// verbatim, under `node --test` — without a real browser, jsdom, or any runtime
// dependency. It provides:
//
//   - a `document`-like facade backed by xpathway + the reference adapter,
//     exposing the members WPT's XPath tests touch (getElementById, evaluate,
//     createExpression, createNSResolver);
//   - the `XPathResult` constructor/constants;
//   - the subset of testharness.js assertions those tests call.
//
// New WPT XPath tests drop in by rebuilding their HTML fixture with the helper
// DOM and pasting the test body.

import assert from 'node:assert/strict';

import { createEvaluator, XPathResult } from '../../src/index.js';
import { adapter } from '../helpers/dom.js';

export { XPathResult };

// Wraps a document node (built with test/helpers/dom.js) as a `document` facade.
export function wptDocument(documentNode) {
  const xpath = createEvaluator(adapter);
  return {
    getElementById: (id) => adapter.getElementById(documentNode, id),
    evaluate: (expression, contextNode, resolver, resultType, result) =>
      xpath.evaluate(expression, contextNode, resolver, resultType, result),
    createExpression: (expression, resolver) => xpath.createExpression(expression, resolver),
    createNSResolver: (node) => xpath.createNSResolver(node),
  };
}

// testharness.js assertions, mapped onto node:assert. WPT's assert_equals uses
// SameValue-style identity, so strict (in)equality is the right mapping.
export const assert_equals = (actual, expected, message) => assert.strictEqual(actual, expected, message);
export const assert_not_equals = (actual, expected, message) => assert.notStrictEqual(actual, expected, message);
export const assert_true = (actual, message) => assert.strictEqual(actual, true, message);
export const assert_false = (actual, message) => assert.strictEqual(actual, false, message);
export const assert_array_equals = (actual, expected, message) =>
  assert.deepStrictEqual([...actual], [...expected], message);
