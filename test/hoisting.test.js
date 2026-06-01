import test from 'node:test';
import assert from 'node:assert/strict';

import { parse } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';
import { makeRootContext } from '../src/context.js';
import { createEvaluator, XPathResult } from '../src/api.js';
import { adapter, doc, element, text } from './helpers/dom.js';

const fixture = doc(element('root', {}, [
  element('item', {}, [text('a')]),
  element('item', {}, [text('b')]),
  element('item', {}, [text('c')]),
]));

test('absolute paths are memoized by AST identity within one evaluation (§7 hoist)', () => {
  const ast = parse('//item');
  const ctx = makeRootContext(fixture, adapter);
  // Same AST, same context cache -> identical result object.
  assert.strictEqual(evaluate(ast, ctx), evaluate(ast, ctx));
});

test('relative paths are not memoized (depend on the context node)', () => {
  const ast = parse('.//item');
  const ctx = makeRootContext(fixture, adapter);
  assert.notStrictEqual(evaluate(ast, ctx), evaluate(ast, ctx));
});

test('a fresh evaluation gets a fresh cache', () => {
  const ast = parse('//item');
  assert.notStrictEqual(
    evaluate(ast, makeRootContext(fixture, adapter)),
    evaluate(ast, makeRootContext(fixture, adapter)),
  );
});

test('an absolute sub-path inside a predicate is computed once, not per candidate', () => {
  // Count base-adapter string-value extractions; the §7 memoizing adapter should
  // collapse repeated reads of the same node to a single underlying call.
  let calls = 0;
  const counting = Object.create(adapter);
  counting.stringValue = (n) => {
    calls += 1;
    return adapter.stringValue(n);
  };

  const ev = createEvaluator(counting);
  // string(.) is read twice per candidate; memoization should make that one
  // underlying extraction per distinct node (3 items -> 3, not 6).
  const r = ev.evaluate('//item[string(.) = string(.)]', fixture, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
  assert.equal(r.snapshotLength, 3);
  assert.equal(calls, 3);
});

test('hoisting preserves correctness for predicates with absolute sub-paths', () => {
  const ev = createEvaluator(adapter);
  // The inner absolute count is constant; all three items qualify.
  const r = ev.evaluate('//item[count(//item) = 3]', fixture, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
  assert.equal(r.snapshotLength, 3);
});
