// XPath 1.0 grammar / lexical error. The public API (§4) maps this to a
// DOMException with name 'SyntaxError' (INVALID_EXPRESSION_ERR); internally we
// throw this richer error so callers can see the position.
export class XPathSyntaxError extends Error {
  constructor(message, pos) {
    super(pos == null ? message : `${message} (at position ${pos})`);
    this.name = 'XPathSyntaxError';
    this.pos = pos ?? null;
  }
}

// Raised when a value cannot be coerced to the requested type, or a result is
// asked of the wrong XPathResult type (§4: TYPE_ERR).
export class XPathTypeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'XPathTypeError';
  }
}
