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
  // value is invariant for one document. Memoize it by AST identity so a
  // predicate like `//label[@for = ...]` runs once, not once per candidate (§7).
  // The cache entry records its document so that a context reused across
  // documents (an embedder mutating ctx.node) can never get a stale result.
  const absolute = ast.root != null && ast.root.type === 'Root';
  const doc = absolute ? documentNodeOf(ctx.node, adapter) : null;
  if (absolute) {
    const cached = ctx.cache.get(ast);
    if (cached && cached.doc === doc) return cached.value;
  }

  const html = isHtmlDocument(ctx.node, adapter);

  let current;
  if (ast.root == null) {
    current = [ctx.node];
  } else if (absolute) {
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
  if (absolute) ctx.cache.set(ast, { doc, value: result });
  return result;
}

// Axes whose results from two *distinct* context nodes can never overlap: a node
// has exactly one parent, so its self / its children / its attributes belong to
// no other context node (the namespace axis is simply always empty). Steps on
// these axes need no cross-node de-duplication.
//
// This relies on the library-wide invariant that every node-set holds DISTINCT
// nodes. All core producers maintain it: axis steps de-dup (or are disjoint),
// union and id() de-dup by identity, predicates filter a distinct set. The only
// way to break it is a custom function (a §12 non-goal, not reachable through the
// public API) that returns a node-set with repeated nodes — such a function would
// already be violating the node-set contract.
const DISJOINT_AXES = new Set(['self', 'child', 'attribute', 'namespace']);

// Applies one step to a whole input node-set, returning the union of the
// per-node results, de-duplicated only when the axis can actually produce
// overlaps across multiple input nodes.
function evaluateStep(step, inputNodes, ctx, html) {
  const { adapter } = ctx;
  const out = [];
  const seen = inputNodes.length > 1 && !DISJOINT_AXES.has(step.axis) ? new Set() : null;

  // `node()` matches every node, so the per-candidate filter is a wasteful full
  // clone of the axis result — common for the `descendant-or-self::node()` that
  // `//` expands to. Skip it in that case.
  const test = step.nodeTest;
  const matchesAll = test.kind === 'type' && test.name === 'node';

  for (const node of inputNodes) {
    let candidates = axisNodes(step.axis, node, adapter);
    if (!matchesAll) {
      candidates = candidates.filter((n) => matchesNodeTest(n, test, step.axis, adapter, ctx.resolver, html));
    }
    candidates = applyPredicates(candidates, step.predicates, ctx, html);
    if (seen) {
      for (const n of candidates) {
        if (!seen.has(n)) {
          seen.add(n);
          out.push(n);
        }
      }
    } else {
      for (const n of candidates) out.push(n);
    }
  }
  return out;
}

// A predicate of this shape always evaluates to a node-set (never a number), so
// it is a boolean filter, not a position test — and it only needs its *existence*,
// which existsBoolean() can decide without materialising the set.
function isNodeSetPredicate(ast) {
  return ast.type === 'Path' || ast.type === 'Filter'
    || (ast.type === 'Binary' && ast.op === 'union');
}

// Filters `nodes` (in axis order) through each predicate in turn. Proximity
// position is the node's 1-based index in the current axis-ordered list; a
// numeric predicate selects that position, any other value is taken as a boolean
// (REC §2.4).
function applyPredicates(nodes, predicates, ctx, html) {
  let current = nodes;
  for (const predicate of predicates) {
    const size = current.length;
    const existence = isNodeSetPredicate(predicate);
    const kept = [];
    for (let i = 0; i < current.length; i++) {
      const position = i + 1;
      const predCtx = withNode(ctx, current[i], position, size);
      let keep;
      if (existence) {
        keep = existsBoolean(predicate, predCtx, html);
      } else {
        const value = evaluate(predicate, predCtx);
        keep = typeof value === 'number' ? value === position : toBoolean(value);
      }
      if (keep) kept.push(current[i]);
    }
    current = kept;
  }
  return current;
}

// Decides whether a node-set-valued expression selects at least one node,
// short-circuiting so common predicates never allocate a node-set. The big win
// is `self::a | self::b | self::c` (the field-finder shape Capybara emits): each
// arm becomes a name-test membership check on the context node.
function existsBoolean(ast, ctx, html) {
  if (ast.type === 'Binary' && ast.op === 'union') {
    return existsBoolean(ast.left, ctx, html) || existsBoolean(ast.right, ctx, html);
  }
  if (ast.type === 'Path') {
    return pathExists(ast, ctx, html);
  }
  // Filter expressions (and anything else) fall back to full materialisation.
  return toBoolean(evaluate(ast, ctx));
}

function pathExists(ast, ctx, html) {
  // Fast path: a context-relative `self::X` with no predicates is pure name-test
  // membership on the context node — no axis walk, no node-set.
  if (ast.root == null && ast.steps.length === 1) {
    const step = ast.steps[0];
    if (step.axis === 'self' && step.predicates.length === 0) {
      return matchesNodeTest(ctx.node, step.nodeTest, 'self', ctx.adapter, ctx.resolver, html);
    }
  }
  return evaluatePath(ast, ctx).size > 0;
}

// FilterExpr: a primary expression (a node-set) narrowed by predicates, which
// apply in document (forward) order.
function evaluateFilter(ast, ctx) {
  const value = evaluate(ast.primary, ctx);
  if (!isNodeSet(value)) {
    throw new XPathTypeError('predicate applied to a non-node-set value');
  }
  const ordered = value.ordered(ctx.adapter).slice();
  const html = isHtmlDocument(ctx.node, ctx.adapter);
  return new NodeSet(applyPredicates(ordered, ast.predicates, ctx, html), true);
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
