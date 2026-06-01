// Public entry point.
//
// The headline surface is the browser-compatible DOM API: create an evaluator
// bound to a DOM adapter (§5), then use evaluate / createExpression /
// createNSResolver exactly like document.* — results come back as XPathResult.
export { createEvaluator, XPathResult } from './api.js';

// Lower-level building blocks, for embedders that want the parser/evaluator
// directly or need to build their own context.
export { tokenize, T } from './lexer.js';
export { parse, AXES } from './parser.js';
export { evaluate } from './evaluate.js';
export { makeRootContext } from './context.js';
export { coreFunctions } from './functions.js';
export {
  NodeSet, isNodeSet, toBoolean, toNumber, toStr, numberToString, stringToNumber,
} from './types.js';
export { XPathSyntaxError, XPathTypeError } from './errors.js';
