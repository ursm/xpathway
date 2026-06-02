import { DOCUMENT } from './node-types.js';

// The 13 XPath axes (REC §2.2). Each function returns the axis's nodes from a
// context node, in *axis order*: forward axes in document order, reverse axes
// (ancestor, ancestor-or-self, preceding, preceding-sibling) in reverse document
// order. Predicate proximity positions are taken directly from this order.
//
// Tree descent is iterative (an explicit stack), never recursive, so deeply
// nested documents do not overflow the call stack (§10.2).

function previousSibling(node, adapter) {
  if (adapter.previousSibling) return adapter.previousSibling(node);
  const parent = adapter.parent(node);
  if (!parent) return null;
  const kids = adapter.childNodes(parent);
  const i = kids.indexOf(node);
  return i > 0 ? kids[i - 1] : null;
}

function nextSibling(node, adapter) {
  if (adapter.nextSibling) return adapter.nextSibling(node);
  const parent = adapter.parent(node);
  if (!parent) return null;
  const kids = adapter.childNodes(parent);
  const i = kids.indexOf(node);
  return i >= 0 && i + 1 < kids.length ? kids[i + 1] : null;
}

// Appends the descendants of `node` (pre-order, document order) to `out`.
function collectDescendants(node, adapter, out) {
  const stack = [];
  pushChildrenReversed(node, adapter, stack);
  while (stack.length) {
    const n = stack.pop();
    out.push(n);
    pushChildrenReversed(n, adapter, stack);
  }
  return out;
}

// Descendant traversal with the node test fused into the walk: only nodes for
// which `match(n)` is true are appended. This is the same pre-order/document
// order as collectDescendants, but it never materialises the full descendant
// set just to filter it — the dominant cost of a `//name` step over a large
// document (§7). When `includeSelf` is set (the `descendant-or-self` axis) the
// context node is tested and emitted first.
export function descendantsMatching(node, adapter, match, includeSelf) {
  const out = [];
  if (includeSelf && match(node)) out.push(node);
  const stack = [];
  pushChildrenReversed(node, adapter, stack);
  while (stack.length) {
    const n = stack.pop();
    if (match(n)) out.push(n);
    pushChildrenReversed(n, adapter, stack);
  }
  return out;
}

function pushChildrenReversed(node, adapter, stack) {
  const kids = adapter.childNodes(node);
  for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
}

function ancestors(node, adapter) {
  const out = [];
  let p = adapter.parent(node);
  while (p) {
    out.push(p); // nearest first => reverse document order
    p = adapter.parent(p);
  }
  return out;
}

// Axis functions may return an adapter-owned array directly (no defensive copy):
// their consumer, evaluateStep, treats the result as read-only — it copies every
// match into a fresh output array (via filter / a push loop / applyPredicates),
// so an axis array is never mutated and never becomes a NodeSet's backing store
// (which NodeSet.ordered() would sort in place). The tree is immutable for the
// duration of an evaluation (§7), so the live `childNodes` / `attributes` arrays
// are stable.
const AXES = {
  self: (node) => [node],

  child: (node, adapter) => adapter.childNodes(node),

  parent: (node, adapter) => {
    const p = adapter.parent(node);
    return p ? [p] : [];
  },

  descendant: (node, adapter) => collectDescendants(node, adapter, []),

  'descendant-or-self': (node, adapter) => collectDescendants(node, adapter, [node]),

  ancestor: (node, adapter) => ancestors(node, adapter),

  'ancestor-or-self': (node, adapter) => [node, ...ancestors(node, adapter)],

  'following-sibling': (node, adapter) => {
    const out = [];
    for (let s = nextSibling(node, adapter); s; s = nextSibling(s, adapter)) out.push(s);
    return out;
  },

  'preceding-sibling': (node, adapter) => {
    const out = [];
    // nearest first => reverse document order (axis order for this reverse axis)
    for (let s = previousSibling(node, adapter); s; s = previousSibling(s, adapter)) out.push(s);
    return out;
  },

  following: (node, adapter) => {
    const out = [];
    let cur = node;
    while (cur && adapter.nodeType(cur) !== DOCUMENT) {
      for (let s = nextSibling(cur, adapter); s; s = nextSibling(s, adapter)) {
        out.push(s);
        collectDescendants(s, adapter, out);
      }
      cur = adapter.parent(cur);
    }
    out.sort((a, b) => adapter.compareDocumentPosition(a, b));
    return out;
  },

  preceding: (node, adapter) => {
    const out = [];
    let cur = node;
    while (cur && adapter.nodeType(cur) !== DOCUMENT) {
      for (let s = previousSibling(cur, adapter); s; s = previousSibling(s, adapter)) {
        out.push(s);
        collectDescendants(s, adapter, out);
      }
      cur = adapter.parent(cur);
    }
    out.sort((a, b) => adapter.compareDocumentPosition(a, b));
    out.reverse(); // reverse document order (axis order)
    return out;
  },

  attribute: (node, adapter) => adapter.attributes(node),

  // Namespace nodes are not modeled by the target DOMs (§5/§12); the namespace
  // axis is always empty. The `namespace::` syntax still parses and evaluates.
  namespace: () => [],
};

// Resolves an axis name to its `(node, adapter) => nodes` function once, so a
// step applied to many input nodes pays a single keyed lookup into AXES instead
// of one per node (that per-node lookup shows up as a megamorphic keyed-load IC
// in profiles). The returned function is then called directly in the hot loop.
export function resolveAxis(axis) {
  const fn = AXES[axis];
  if (!fn) throw new Error(`unsupported axis: ${axis}`);
  return fn;
}
