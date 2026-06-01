// Public entry point. Expands as later stages land (axes, function library,
// the public DOM API). For now it exposes the front-end and evaluator core.
export { tokenize, T } from './lexer.js';
export { parse, AXES } from './parser.js';
export { evaluate } from './evaluate.js';
export { makeRootContext } from './context.js';
export { coreFunctions } from './functions.js';
export {
  NodeSet, isNodeSet, toBoolean, toNumber, toStr, numberToString, stringToNumber,
} from './types.js';
export { XPathSyntaxError, XPathTypeError } from './errors.js';
