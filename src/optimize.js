// Post-parse AST normalization (REC-preserving rewrites applied once per parse,
// so the cost is amortised across every evaluation of a cached expression — §7).
//
// Today this performs a single rewrite: fusing the step pair that `//` expands
// to into one `descendant` step.

// `//` abbreviates `/descendant-or-self::node()/` (REC §2.5), so `//E` is the
// step pair `descendant-or-self::node()` followed by `child::E`. The node-set
// `descendant-or-self::node()/child::E` is exactly `descendant::E`: a `child` is
// the base relation of the `descendant` axis (REC §2.2), every descendant has a
// parent that is itself a descendant-or-self node, and neither axis yields
// attribute or namespace nodes. Fusing the pair into a single `descendant::E`
// step avoids materialising the whole `descendant-or-self::node()` set (every
// node, text and comments included) and then re-walking each node's children —
// the dominant cost of the `.//X` shape Capybara emits (§7).
//
// The two forms differ in only one respect: a predicate on the `child` step is
// applied per parent (proximity position/size reset within each parent's
// matching children), whereas on the fused `descendant` step it is applied over
// one flat document-ordered list. Those groupings are indistinguishable unless a
// predicate observes proximity position or size — i.e. it is a numeric (position)
// predicate, or it calls position()/last(). Those are the only constructs in
// XPath 1.0 that expose the context position/size (variables are a §12 non-goal,
// rejected at parse). When no predicate can observe position, the fused step
// selects the identical node-set in identical document order, so the rewrite is
// sound. The guard below is deliberately conservative: any doubt forgoes it.

// Core functions whose result type is number. A predicate whose top-level
// expression is one of these (or an arithmetic/number form) has static type
// number, which makes it a proximity-position test (REC §2.4).
const NUMERIC_FUNCTIONS = new Set([
  'last', 'position', 'count', 'sum', 'floor', 'ceiling', 'round', 'number', 'string-length',
]);

// Whether a predicate's top-level expression yields a number (so the predicate
// is a position test). Every other top-level form is boolean-coerced and thus
// position-independent: Literal is a string, comparison/logical Binary and the
// boolean/string core functions are booleans/strings, union/Path/Filter are
// node-sets (existence tests).
function mayYieldNumber(ast) {
  switch (ast.type) {
    case 'Number':
    case 'Unary': // numeric negation
      return true;
    case 'Binary':
      return ast.op === '+' || ast.op === '-' || ast.op === '*'
        || ast.op === 'div' || ast.op === 'mod';
    case 'Function':
      return ast.prefix == null && NUMERIC_FUNCTIONS.has(ast.name);
    default:
      return false;
  }
}

// Whether position() or last() appears anywhere in the predicate subtree. This
// over-counts: a position()/last() inside a *nested* step's predicate refers to
// that inner context, not this one, so flagging it merely forgoes the rewrite —
// never a wrong result. (last() is the only way to read context size; position()
// the only way to read context position.)
function referencesPositionOrLast(ast) {
  if (ast.type === 'Function' && ast.prefix == null
      && (ast.name === 'position' || ast.name === 'last')) {
    return true;
  }
  for (const key in ast) {
    const v = ast[key];
    if (!v || typeof v !== 'object') continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item && typeof item.type === 'string' && referencesPositionOrLast(item)) return true;
      }
    } else if (typeof v.type === 'string') {
      if (referencesPositionOrLast(v)) return true;
    }
  }
  return false;
}

// True when every predicate of a `child` step is position-stable, so the step
// selects the same nodes whether grouped per parent or evaluated over the flat
// descendant list.
function predicatesArePositionStable(predicates) {
  for (const p of predicates) {
    if (mayYieldNumber(p) || referencesPositionOrLast(p)) return false;
  }
  return true;
}

function isDescendantOrSelfNodeStep(step) {
  return step.axis === 'descendant-or-self'
    && step.nodeTest.kind === 'type' && step.nodeTest.name === 'node'
    && step.predicates.length === 0;
}

// Fuses `descendant-or-self::node()` + `child::X[stable preds]` pairs in a steps
// array into `descendant::X[preds]`, in place (the AST is freshly parsed and not
// yet shared, so mutation is safe).
function fuseDescendantSteps(steps) {
  for (let i = 0; i < steps.length - 1; i++) {
    const a = steps[i];
    const b = steps[i + 1];
    if (isDescendantOrSelfNodeStep(a)
        && b.axis === 'child'
        && predicatesArePositionStable(b.predicates)) {
      steps.splice(i, 2, {
        type: 'Step', axis: 'descendant', nodeTest: b.nodeTest, predicates: b.predicates,
      });
      // The merged `descendant` step at index i never starts a new pair, so the
      // loop's i++ correctly advances past it.
    }
  }
  return steps;
}

// Walks the whole AST, applying step fusion to every location path — including
// paths nested inside predicates, function arguments, and filter expressions.
export function optimize(ast) {
  if (ast == null || typeof ast !== 'object') return ast;
  switch (ast.type) {
    case 'Path':
      optimize(ast.root);
      for (const step of ast.steps) {
        for (const p of step.predicates) optimize(p);
      }
      fuseDescendantSteps(ast.steps);
      break;
    case 'Filter':
      optimize(ast.primary);
      for (const p of ast.predicates) optimize(p);
      break;
    case 'Binary':
      optimize(ast.left);
      optimize(ast.right);
      break;
    case 'Unary':
      optimize(ast.operand);
      break;
    case 'Function':
      for (const arg of ast.args) optimize(arg);
      break;
    default:
      break;
  }
  return ast;
}
