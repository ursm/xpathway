'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';

import { parse } from '../src/parser.js';
import { XPathSyntaxError } from '../src/errors.js';

const nameStep = (axis, local, predicates = []) => ({
  type: 'Step',
  axis,
  nodeTest: { kind: 'name', prefix: null, local },
  predicates,
});

const dosStep = () => ({
  type: 'Step',
  axis: 'descendant-or-self',
  nodeTest: { kind: 'type', name: 'node', literal: null },
  predicates: [],
});

test('relative location path', () => {
  assert.deepEqual(parse('a/b'), {
    type: 'Path',
    root: null,
    steps: [nameStep('child', 'a'), nameStep('child', 'b')],
  });
});

test('absolute location path', () => {
  assert.deepEqual(parse('/a'), {
    type: 'Path',
    root: { type: 'Root' },
    steps: [nameStep('child', 'a')],
  });
});

test('lone slash is the document root', () => {
  assert.deepEqual(parse('/'), { type: 'Path', root: { type: 'Root' }, steps: [] });
});

test('// desugars to descendant-or-self::node()', () => {
  assert.deepEqual(parse('//a'), {
    type: 'Path',
    root: { type: 'Root' },
    steps: [dosStep(), nameStep('child', 'a')],
  });
  assert.deepEqual(parse('a//b'), {
    type: 'Path',
    root: null,
    steps: [nameStep('child', 'a'), dosStep(), nameStep('child', 'b')],
  });
});

test('abbreviated steps . and ..', () => {
  assert.deepEqual(parse('.'), {
    type: 'Path',
    root: null,
    steps: [{ type: 'Step', axis: 'self', nodeTest: { kind: 'type', name: 'node', literal: null }, predicates: [] }],
  });
  assert.deepEqual(parse('..'), {
    type: 'Path',
    root: null,
    steps: [{ type: 'Step', axis: 'parent', nodeTest: { kind: 'type', name: 'node', literal: null }, predicates: [] }],
  });
});

test('attribute abbreviation and full axis', () => {
  assert.deepEqual(parse('@id'), {
    type: 'Path',
    root: null,
    steps: [nameStep('attribute', 'id')],
  });
  assert.deepEqual(parse('attribute::id'), {
    type: 'Path',
    root: null,
    steps: [nameStep('attribute', 'id')],
  });
});

test('predicates', () => {
  const ast = parse('a[1]');
  assert.equal(ast.steps[0].predicates.length, 1);
  assert.deepEqual(ast.steps[0].predicates[0], { type: 'Number', value: 1 });
});

test('node tests', () => {
  assert.deepEqual(parse('text()').steps[0].nodeTest, { kind: 'type', name: 'text', literal: null });
  assert.deepEqual(parse("processing-instruction('php')").steps[0].nodeTest, {
    kind: 'type', name: 'processing-instruction', literal: 'php',
  });
  assert.deepEqual(parse('*').steps[0].nodeTest, { kind: 'name', prefix: null, local: '*' });
  assert.deepEqual(parse('svg:*').steps[0].nodeTest, { kind: 'name', prefix: 'svg', local: '*' });
});

test('operator precedence: or < and < equality < relational < additive < multiplicative', () => {
  const ast = parse('1 + 2 * 3');
  assert.equal(ast.type, 'Binary');
  assert.equal(ast.op, '+');
  assert.equal(ast.right.op, '*');

  const ast2 = parse('a or b and c');
  assert.equal(ast2.op, 'or');
  assert.equal(ast2.right.op, 'and');
});

test('unary minus', () => {
  assert.deepEqual(parse('-1'), { type: 'Unary', operand: { type: 'Number', value: 1 } });
  assert.deepEqual(parse('- -1'), { type: 'Unary', operand: { type: 'Unary', operand: { type: 'Number', value: 1 } } });
});

test('union', () => {
  const ast = parse('a | b');
  assert.equal(ast.type, 'Binary');
  assert.equal(ast.op, 'union');
});

test('function calls', () => {
  assert.deepEqual(parse('true()'), { type: 'Function', prefix: null, name: 'true', args: [] });
  const ast = parse("contains(., 'x')");
  assert.equal(ast.name, 'contains');
  assert.equal(ast.args.length, 2);
});

test('filter expression with predicate and trailing path', () => {
  const ast = parse('(a | b)[1]/c');
  assert.equal(ast.type, 'Path');
  assert.equal(ast.root.type, 'Filter');
  assert.equal(ast.steps.length, 1);
});

test('real-world Capybara-style expression', () => {
  // Should parse without error.
  assert.doesNotThrow(() => parse(".//label[contains(normalize-space(string(.)), 'Name')]/@for"));
  assert.doesNotThrow(() => parse("//*[self::input or self::textarea][@name = 'q']"));
});

test('syntax errors', () => {
  assert.throws(() => parse('a/'), XPathSyntaxError);
  assert.throws(() => parse('a['), XPathSyntaxError);
  assert.throws(() => parse('foo(,)'), XPathSyntaxError);
  assert.throws(() => parse('1 + '), XPathSyntaxError);
  assert.throws(() => parse('$x'), XPathSyntaxError); // unsupported, but a clean error
  assert.throws(() => parse('bogus-axis::a'), XPathSyntaxError);
});
