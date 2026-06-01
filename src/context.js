import { coreFunctions } from './functions.js';

// An evaluation context (REC §1): the context node, a 1-based position within a
// context size, plus the injected adapter, namespace resolver, and function
// table. The root context for a whole expression has position = size = 1.
export function makeRootContext(node, adapter, { resolver = null, functions = coreFunctions } = {}) {
  return { node, position: 1, size: 1, adapter, resolver, functions };
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
  };
}
