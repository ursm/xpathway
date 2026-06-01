import { NodeSet, isNodeSet, toBoolean, toNumber } from './types.js';
import { compareEquality, compareRelational } from './compare.js';
import { axisNodes } from './axes.js';
import { matchesNodeTest, isHtmlDocument, documentNodeOf } from './nodetest.js';
import { withNode } from './context.js';
import { XPathTypeError } from './errors.js';

// Core expression evaluator. Given an AST node and an evaluation context, returns
// an XPath value (boolean | number | string | NodeSet).
//
// Context shape:
//   { node, position, size, adapter, resolver, functions }
//   - node      : the context node (opaque host handle)
//   - position  : 1-based context position
//   - size      : context size
//   - adapter   : the injected DOM adapter (§5)
//   - resolver  : namespace prefix -> URI lookup (or null)
//   - functions : function-library table (wired in Stage 4)
//
// Location paths, filter expressions, and function calls are evaluated by later
// stages; until then they raise a clear "not implemented" error so partial
// builds fail loudly rather than silently.

export function evaluate(ast, ctx) {
  switch (ast.type) {
    case 'Literal':
      return ast.value;
    case 'Number':
      return ast.value;
    case 'Unary':
      return -toNumber(evaluate(ast.operand, ctx), ctx.adapter);
    case 'Binary':
      return evaluateBinary(ast, ctx);
    case 'Path':
      return evaluatePath(ast, ctx);
    case 'Filter':
      return evaluateFilter(ast, ctx);
    case 'Function':
      return evaluateFunction(ast, ctx);
    default:
      throw new XPathTypeError(`unknown AST node type '${ast.type}'`);
  }
}

const ARITHMETIC = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  'div': (a, b) => a / b,
  // XPath `mod` is a truncating remainder, which is exactly JS `%`.
  'mod': (a, b) => a % b,
};

function evaluateBinary(ast, ctx) {
  const { op } = ast;

  // Logical operators short-circuit (REC §3.4).
  if (op === 'or') {
    return toBoolean(evaluate(ast.left, ctx)) || toBoolean(evaluate(ast.right, ctx));
  }
  if (op === 'and') {
    return toBoolean(evaluate(ast.left, ctx)) && toBoolean(evaluate(ast.right, ctx));
  }

  if (op === 'union') {
    const left = evaluate(ast.left, ctx);
    const right = evaluate(ast.right, ctx);
    if (!isNodeSet(left) || !isNodeSet(right)) {
      throw new XPathTypeError('union operand is not a node-set');
    }
    return unionNodeSets(left, right);
  }

  const left = evaluate(ast.left, ctx);
  const right = evaluate(ast.right, ctx);

  if (op === '=' || op === '!=') {
    return compareEquality(op, left, right, ctx.adapter);
  }
  if (op === '<' || op === '<=' || op === '>' || op === '>=') {
    return compareRelational(op, left, right, ctx.adapter);
  }

  const arith = ARITHMETIC[op];
  return arith(toNumber(left, ctx.adapter), toNumber(right, ctx.adapter));
}

// Set union by node identity; document order is established lazily when observed.
export function unionNodeSets(a, b) {
  const seen = new Set(a.nodes);
  const nodes = a.nodes.slice();
  for (const n of b.nodes) {
    if (!seen.has(n)) {
      seen.add(n);
      nodes.push(n);
    }
  }
  return new NodeSet(nodes, false);
}

// --- Location paths and steps (REC §2) -------------------------------------

function evaluatePath(ast, ctx) {
  const { adapter } = ctx;

  // An absolute location path is independent of the outer context node, so its
  // value is invariant for the whole evaluation. Memoize it by AST identity so a
  // predicate like `//label[@for = ...]` runs once, not once per candidate (§7).
  const absolute = ast.root != null && ast.root.type === 'Root';
  if (absolute && ctx.cache.has(ast)) return ctx.cache.get(ast);

  const html = isHtmlDocument(ctx.node, adapter);

  let current;
  if (ast.root == null) {
    current = [ctx.node];
  } else if (absolute) {
    const doc = documentNodeOf(ctx.node, adapter);
    current = doc ? [doc] : [];
  } else {
    const value = evaluate(ast.root, ctx);
    if (!isNodeSet(value)) {
      throw new XPathTypeError('the left-hand side of a path step is not a node-set');
    }
    current = value.nodes.slice();
  }

  for (const step of ast.steps) {
    current = evaluateStep(step, current, ctx, html);
  }
  const result = new NodeSet(current, false);
  if (absolute) ctx.cache.set(ast, result);
  return result;
}

// Applies one step to a whole input node-set, returning the de-duplicated union
// of the per-node results.
function evaluateStep(step, inputNodes, ctx, html) {
  const { adapter } = ctx;
  const out = [];
  const seen = new Set();

  for (const node of inputNodes) {
    let candidates = axisNodes(step.axis, node, adapter);
    candidates = candidates.filter((n) => matchesNodeTest(n, step.nodeTest, step.axis, adapter, ctx.resolver, html));
    candidates = applyPredicates(candidates, step.predicates, ctx);
    for (const n of candidates) {
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

// Filters `nodes` (in axis order) through each predicate in turn. Proximity
// position is the node's 1-based index in the current axis-ordered list; a
// numeric predicate selects that position, any other value is taken as a boolean
// (REC §2.4).
function applyPredicates(nodes, predicates, ctx) {
  let current = nodes;
  for (const predicate of predicates) {
    const size = current.length;
    const kept = [];
    for (let i = 0; i < current.length; i++) {
      const position = i + 1;
      const value = evaluate(predicate, withNode(ctx, current[i], position, size));
      const keep = typeof value === 'number' ? value === position : toBoolean(value);
      if (keep) kept.push(current[i]);
    }
    current = kept;
  }
  return current;
}

// FilterExpr: a primary expression (a node-set) narrowed by predicates, which
// apply in document (forward) order.
function evaluateFilter(ast, ctx) {
  const value = evaluate(ast.primary, ctx);
  if (!isNodeSet(value)) {
    throw new XPathTypeError('predicate applied to a non-node-set value');
  }
  const ordered = value.ordered(ctx.adapter).slice();
  return new NodeSet(applyPredicates(ordered, ast.predicates, ctx), true);
}

function evaluateFunction(ast, ctx) {
  if (ast.prefix) {
    throw new XPathTypeError(`unknown function: ${ast.prefix}:${ast.name}()`);
  }
  const fn = ctx.functions && ctx.functions[ast.name];
  if (!fn) {
    throw new XPathTypeError(`unknown function: ${ast.name}()`);
  }
  const args = ast.args.map((arg) => evaluate(arg, ctx));
  return fn(ctx, args);
}
