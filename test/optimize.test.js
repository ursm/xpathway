import test from 'node:test';
import assert from 'node:assert/strict';

import { parse } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';
import { makeRootContext } from '../src/context.js';
import { adapter, doc, element, text } from './helpers/dom.js';

// optimize() fuses `descendant-or-self::node()` + `child::E[stable preds]` (the
// pair `//` desugars to) into a single `descendant::E[preds]` step, but only
// when no predicate can observe proximity position/size.

const axisOf = (ast) => ast.steps.map((s) => `${s.axis}::${s.nodeTest.local ?? s.nodeTest.name}`);

test('fuses // into a single descendant step', () => {
  assert.deepEqual(axisOf(parse('//e')), ['descendant::e']);
  assert.deepEqual(axisOf(parse('a//b')), ['child::a', 'descendant::b']);
  assert.deepEqual(axisOf(parse('a//b//c')), ['child::a', 'descendant::b', 'descendant::c']);
  // The leading self::node() of `.//E` is left intact; only the dos/child pair fuses.
  assert.deepEqual(axisOf(parse('.//e')), ['self::node', 'descendant::e']);
  // An explicitly written descendant-or-self::node()/child step fuses too.
  assert.deepEqual(axisOf(parse('descendant-or-self::node()/e')), ['descendant::e']);
});

test('fuses paths nested inside predicates and function args', () => {
  assert.deepEqual(axisOf(parse('//x[.//y]')), ['descendant::x']);
  assert.deepEqual(axisOf(parse('//x[.//y]').steps[0].predicates[0]), ['self::node', 'descendant::y']);
  assert.deepEqual(axisOf(parse('//x[count(.//y) = 0]').steps[0].predicates[0].left.args[0]),
    ['self::node', 'descendant::y']);
});

test('keeps non-child axes and the attribute step unfused', () => {
  // `//@id` is descendant-or-self::node()/attribute::id — a different axis.
  assert.deepEqual(axisOf(parse('//@id')), ['descendant-or-self::node', 'attribute::id']);
  // descendant-or-self::node()/parent::e is not a child step.
  assert.deepEqual(axisOf(parse('descendant-or-self::node()/parent::e')),
    ['descendant-or-self::node', 'parent::e']);
});

test('does NOT fuse when a predicate observes proximity position or size', () => {
  const unfused = (expr) => assert.deepEqual(axisOf(parse(expr)).slice(0, 2),
    ['descendant-or-self::node', 'child::e'], `${expr} must stay unfused`);
  unfused('//e[1]'); // numeric literal -> position test (the //b[1] gotcha)
  unfused('//e[position() = 1]');
  unfused('//e[last()]');
  unfused('//e[count(x)]'); // bare numeric function -> position test
  unfused('//e[floor(2)]');
  unfused('//e[-1]');
  unfused('//e[2 + 1]');
  unfused('//e[@a][1]'); // a later positional predicate also blocks the pair
  unfused('//e[position() < 3 or @a]'); // position() nested in a boolean still blocks
});

test('DOES fuse position-stable predicates (boolean / existence / string)', () => {
  const fused = (expr) => assert.equal(axisOf(parse(expr))[0], 'descendant::e', `${expr} should fuse`);
  fused("//e[@id = 'x']");
  fused('//e[not(@a)]');
  fused('//e[@a or @b]');
  fused('//e[count(x) = 2]'); // count() inside a comparison is boolean, not a position test
  fused('//e[normalize-space(string(.)) = "y"]');
  fused('//e[self::a | self::b]');
  fused('//e[.//y]'); // an inner last()/position() would refer to y's context, but there is none here
});

// --- behavioural equivalence (the fused path must select the right nodes) ----

function build() {
  // root > a1 > (b1, a2 > b2)   — a2 is nested inside a1, so //a//b overlaps.
  const b1 = element('b', {}, [text('B1')]);
  const b2 = element('b', {}, [text('B2')]);
  const a2 = element('a', { id: 'a2' }, [b2]);
  const a1 = element('a', { id: 'a1' }, [b1, a2]);
  const root = element('root', {}, [a1]);
  return { document: doc(root), a1, a2, b1, b2 };
}

const fx = build();
const labels = (expr, node = fx.document) =>
  evaluate(parse(expr), makeRootContext(node, adapter))
    .ordered(adapter)
    .map((n) => adapter.localName(n) + (adapter.getAttribute(n, null, 'id') ? `#${adapter.getAttribute(n, null, 'id')}` : ''));

test('fused //a//b dedups overlapping descendants and keeps document order', () => {
  // a1 and a2(nested) both reach b2; the result must contain each b once.
  assert.deepEqual(labels('//a//b'), ['b', 'b']);
  assert.deepEqual(labels('//b'), ['b', 'b']);
  assert.deepEqual(labels('//a'), ['a#a1', 'a#a2']);
});

test('the //e[1] gotcha survives the rewrite (unfused, per-parent position)', () => {
  // //b[1] = each b that is the first b-child of its parent -> both b1 and b2.
  assert.deepEqual(labels('//b[1]'), ['b', 'b']);
  // (//b)[1] = the first b in the whole set -> one.
  assert.deepEqual(labels('(//b)[1]'), ['b']);
});
