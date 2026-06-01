import { XPathTypeError } from './errors.js';

// XPath 1.0 core function library (REC §4). Stage 3 wires only the context
// functions that predicates depend on; Stage 4 fills in the rest. Each function
// is `fn(ctx, args)` where `args` are already-evaluated XPath values.

function arity(name, args, min, max = min) {
  if (args.length < min || args.length > max) {
    const range = min === max ? `${min}` : `${min}-${max}`;
    throw new XPathTypeError(`${name}() expects ${range} argument(s), got ${args.length}`);
  }
}

export const coreFunctions = {
  position: (ctx, args) => {
    arity('position', args, 0);
    return ctx.position;
  },
  last: (ctx, args) => {
    arity('last', args, 0);
    return ctx.size;
  },
};
