import { coreFunctions } from './functions.js';

// An evaluation context (REC §1): the context node, a 1-based position within a
// context size, plus the injected adapter, namespace resolver, and function
// table. The root context for a whole expression has position = size = 1.
//
// `cache` is a per-evaluation memo (Map keyed by AST node) shared by every child
// context. It holds the results of context-independent absolute location paths
// so they are computed once per document rather than re-run inside predicate
// loops (§7 hoisting). It is safe because the DOM is immutable during a single
// evaluation.
export function makeRootContext(node, adapter, { resolver = null, functions = coreFunctions } = {}) {
  return { node, position: 1, size: 1, adapter, resolver, functions, cache: new Map() };
}

// A child context sharing everything but the current node/position/size, used
// when evaluating predicates and per-node sub-expressions.
export function withNode(ctx, node, position, size) {
  return {
    node,
    position,
    size,
    adapter: ctx.adapter,
    resolver: ctx.resolver,
    functions: ctx.functions,
    cache: ctx.cache,
  };
}
