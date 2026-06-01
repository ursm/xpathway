'use strict';

// Public entry point. Expands as later stages land (evaluator, public DOM API).
// For now it exposes the front-end: tokenizer and parser.
export { tokenize, T } from './lexer.js';
export { parse, AXES } from './parser.js';
export { XPathSyntaxError, XPathTypeError } from './errors.js';
