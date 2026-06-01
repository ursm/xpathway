import { NodeSet, isNodeSet, toBoolean, toNumber } from './types.js';
import { compareEquality, compareRelational, compareValueLiteral } from './compare.js';
import { resolveAxis, descendantsMatching } from './axes.js';
import { matchesNodeTest, documentNodeOf, attributeValue } from './nodetest.js';
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

  if (op === '=' || op === '!=' || op === '<' || op === '<=' || op === '>' || op === '>=') {
    // Fast path for `@name <op> literal` (the dominant Capybara predicate shape):
    // resolve the attribute via getAttribute instead of materialising an
    // attribute-axis node-set per candidate node.
    const fast = tryAttributeComparison(ast, ctx);
    if (fast !== null) return fast;

    const left = evaluate(ast.left, ctx);
    const right = evaluate(ast.right, ctx);
    return (op === '=' || op === '!=')
      ? compareEquality(op, left, right, ctx.adapter)
      : compareRelational(op, left, right, ctx.adapter);
  }

  const arith = ARITHMETIC[op];
  return arith(toNumber(evaluate(ast.left, ctx), ctx.adapter), toNumber(evaluate(ast.right, ctx), ctx.adapter));
}

// Relational operators with the attribute on the right-hand side compare in the
// opposite direction.
const FLIP_REL = {
  '<': '>', '>': '<', '<=': '>=', '>=': '<=',
};

// A `self::node()` step (the `.` abbreviation): a no-op that just re-selects the
// context node.
function isSelfNodeStep(step) {
  return step.axis === 'self'
    && step.nodeTest.kind === 'type' && step.nodeTest.name === 'node'
    && step.predicates.length === 0;
}

// The single effective step of a context-relative path, tolerating a leading
// `self::node()`: Capybara emits `./@id` (a `.` step then the attribute step),
// which is equivalent to the bare `@id`. Returns the step, or null.
function singleRelativeStep(ast) {
  if (ast.type !== 'Path' || ast.root != null) return null;
  const { steps } = ast;
  if (steps.length === 1) return steps[0];
  if (steps.length === 2 && isSelfNodeStep(steps[0])) return steps[1];
  return null;
}

// The name test of a relative `@name` / `./@name` step (concrete, non-`*`, no
// predicate), or null.
function simpleAttributeNameTest(ast) {
  const step = singleRelativeStep(ast);
  if (step === null || step.axis !== 'attribute' || step.predicates.length !== 0) return null;
  const test = step.nodeTest;
  return test.kind === 'name' && test.local !== '*' ? test : null;
}

// A compile-time constant operand (string or number literal), or undefined.
function constantOperand(ast) {
  if (ast.type === 'Literal') return ast.value;
  if (ast.type === 'Number') return ast.value;
  return undefined;
}

// Returns the boolean result of `@name <op> literal`, or null when the
// expression is not of that shape (so the caller falls back to full evaluation).
function tryAttributeComparison(ast, ctx) {
  let nameTest = simpleAttributeNameTest(ast.left);
  let literal = nameTest === null ? undefined : constantOperand(ast.right);
  let attributeOnLeft = true;
  if (nameTest === null || literal === undefined) {
    nameTest = simpleAttributeNameTest(ast.right);
    literal = nameTest === null ? undefined : constantOperand(ast.left);
    attributeOnLeft = false;
  }
  if (nameTest === null || literal === undefined) return null;

  const value = attributeValue(ctx.node, nameTest, ctx.adapter, ctx.resolver, ctx.html);
  // An absent attribute is the empty node-set: every comparison with a primitive
  // is false (existential over no nodes), including `!=`.
  if (value === undefined) return false;

  const op = !attributeOnLeft && FLIP_REL[ast.op] ? FLIP_REL[ast.op] : ast.op;
  return compareValueLiteral(op, value, literal);
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

  const { html } = ctx;

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
//
// The axis result is treated as READ-ONLY: matches are copied into the fresh
// `out` array (and predicate filtering allocates its own array), so the axis
// function may hand back an adapter-owned array without copying it (see axes.js).
function evaluateStep(step, inputNodes, ctx, html) {
  const out = [];
  // No input nodes (a prior step matched nothing) → no work, and nothing to set
  // up: skip the per-step closure/array allocation below entirely.
  if (inputNodes.length === 0) return out;

  const { adapter } = ctx;
  const seen = inputNodes.length > 1 && !DISJOINT_AXES.has(step.axis) ? new Set() : null;

  // `node()` matches every node, so the per-candidate filter is a wasteful full
  // clone of the axis result — common for the `descendant-or-self::node()` that
  // `//` expands to. Skip it in that case.
  const test = step.nodeTest;
  const matchesAll = test.kind === 'type' && test.name === 'node';

  // For a selective name test on a descendant axis, fuse the test into the tree
  // walk (descendantsMatching) so the full descendant set is never built just to
  // be filtered. Only descendant/descendant-or-self are fused: `child` has no
  // intermediate set to avoid, and `following`/`preceding` must materialise then
  // sort, so streaming the filter buys nothing. The match closure is loop-
  // invariant — build it once.
  const fuseDescendant = !matchesAll
    && (step.axis === 'descendant' || step.axis === 'descendant-or-self');
  const includeSelf = step.axis === 'descendant-or-self';
  const match = fuseDescendant
    ? (n) => matchesNodeTest(n, test, step.axis, adapter, ctx.resolver, html)
    : null;
  // Resolve the axis function once per step rather than per input node.
  const axisFn = fuseDescendant ? null : resolveAxis(step.axis);

  // Predicate purity (existence-filter vs position test) depends only on the
  // predicate AST, so classify once per step instead of once per input node.
  const predicates = step.predicates;
  const purity = predicates.length ? predicates.map(isPureNodeSet) : null;

  for (const node of inputNodes) {
    let candidates;
    if (fuseDescendant) {
      candidates = descendantsMatching(node, adapter, match, includeSelf);
    } else {
      candidates = axisFn(node, adapter);
      if (!matchesAll) {
        candidates = candidates.filter((n) => matchesNodeTest(n, test, step.axis, adapter, ctx.resolver, html));
      }
    }
    if (purity) candidates = applyPredicates(candidates, predicates, purity, ctx, html);
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
// it is a boolean filter, not a position test — and its truth is just existence,
// which existsBoolean() can decide without materialising the set. A union only
// qualifies when *every* arm is itself a pure node-set; a union with a non-node-
// set arm (e.g. `a | count(b)`) is malformed and must still raise a type error
// through the normal evaluation path rather than being silently coerced.
function isPureNodeSet(ast) {
  if (ast.type === 'Path' || ast.type === 'Filter') return true;
  if (ast.type === 'Binary' && ast.op === 'union') {
    return isPureNodeSet(ast.left) && isPureNodeSet(ast.right);
  }
  return false;
}

// Filters `nodes` (in axis order) through each predicate in turn. Proximity
// position is the node's 1-based index in the current axis-ordered list; a
// numeric predicate selects that position, any other value is taken as a boolean
// (REC §2.4).
function applyPredicates(nodes, predicates, purity, ctx, html) {
  let current = nodes;
  for (let p = 0; p < predicates.length; p++) {
    const predicate = predicates[p];
    const existence = purity[p];
    const size = current.length;
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
  // The caller (isPureNodeSet) only routes pure node-sets here, so this is a
  // Filter expression — materialise it and test non-emptiness.
  return toBoolean(evaluate(ast, ctx));
}

function pathExists(ast, ctx, html) {
  // Fast paths for a context-relative single step (allowing a leading `./`).
  const step = singleRelativeStep(ast);
  if (step !== null && step.predicates.length === 0) {
    // `self::X` is pure name-test membership on the context node.
    if (step.axis === 'self') {
      return matchesNodeTest(ctx.node, step.nodeTest, 'self', ctx.adapter, ctx.resolver, html);
    }
    // `@name` existence is a single getAttribute, no attribute-axis node-set.
    if (step.axis === 'attribute' && step.nodeTest.kind === 'name' && step.nodeTest.local !== '*') {
      return attributeValue(ctx.node, step.nodeTest, ctx.adapter, ctx.resolver, html) !== undefined;
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
  const purity = ast.predicates.map(isPureNodeSet);
  return new NodeSet(applyPredicates(ordered, ast.predicates, purity, ctx, ctx.html), true);
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
