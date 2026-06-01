import { parse } from './parser.js';
import { evaluate as evaluateExpr } from './evaluate.js';
import { makeRootContext } from './context.js';
import { isNodeSet, toBoolean, toNumber, toStr } from './types.js';
import { XML_NS, ELEMENT } from './node-types.js';
import { XPathSyntaxError, XPathTypeError } from './errors.js';

// Public, browser-compatible DOM Level 3 XPath surface (§4): document.evaluate,
// createExpression, createNSResolver, and XPathResult — driven by an injected
// DOM adapter (§5) so the same code runs against any host DOM.

// XPathResult type constants (DOM L3 XPath).
const ANY_TYPE = 0;
const NUMBER_TYPE = 1;
const STRING_TYPE = 2;
const BOOLEAN_TYPE = 3;
const UNORDERED_NODE_ITERATOR_TYPE = 4;
const ORDERED_NODE_ITERATOR_TYPE = 5;
const UNORDERED_NODE_SNAPSHOT_TYPE = 6;
const ORDERED_NODE_SNAPSHOT_TYPE = 7;
const ANY_UNORDERED_NODE_TYPE = 8;
const FIRST_ORDERED_NODE_TYPE = 9;

const ITERATOR_TYPES = new Set([UNORDERED_NODE_ITERATOR_TYPE, ORDERED_NODE_ITERATOR_TYPE]);
const SNAPSHOT_TYPES = new Set([UNORDERED_NODE_SNAPSHOT_TYPE, ORDERED_NODE_SNAPSHOT_TYPE]);
const SINGLE_TYPES = new Set([ANY_UNORDERED_NODE_TYPE, FIRST_ORDERED_NODE_TYPE]);
const NODE_TYPES = new Set([
  ...ITERATOR_TYPES, ...SNAPSHOT_TYPES, ...SINGLE_TYPES,
]);

function naturalType(value) {
  if (isNodeSet(value)) return UNORDERED_NODE_ITERATOR_TYPE;
  if (typeof value === 'boolean') return BOOLEAN_TYPE;
  if (typeof value === 'number') return NUMBER_TYPE;
  return STRING_TYPE;
}

export class XPathResult {
  constructor(value, requestedType, adapter, exceptions) {
    this._exceptions = exceptions;
    const type = requestedType === ANY_TYPE ? naturalType(value) : requestedType;
    this._type = type;

    if (NODE_TYPES.has(type)) {
      if (!isNodeSet(value)) {
        throw exceptions.typeError('result cannot be converted to the requested node-set type');
      }
      // Browsers materialise even the "unordered" variants in document order.
      const nodes = value.ordered(adapter);
      if (ITERATOR_TYPES.has(type)) {
        this._nodes = nodes.slice();
        this._index = 0;
      } else if (SNAPSHOT_TYPES.has(type)) {
        this._snapshot = nodes.slice();
      } else {
        this._single = nodes.length > 0 ? nodes[0] : null;
      }
    } else if (type === NUMBER_TYPE) {
      this._number = toNumber(value, adapter);
    } else if (type === STRING_TYPE) {
      this._string = toStr(value, adapter);
    } else if (type === BOOLEAN_TYPE) {
      this._boolean = toBoolean(value);
    } else {
      throw exceptions.typeError(`unknown XPathResult type: ${type}`);
    }
  }

  _wrongType(what) {
    return this._exceptions.typeError(`${what} is not available for result type ${this._type}`);
  }

  get resultType() {
    return this._type;
  }

  get numberValue() {
    if (this._type !== NUMBER_TYPE) throw this._wrongType('numberValue');
    return this._number;
  }

  get stringValue() {
    if (this._type !== STRING_TYPE) throw this._wrongType('stringValue');
    return this._string;
  }

  get booleanValue() {
    if (this._type !== BOOLEAN_TYPE) throw this._wrongType('booleanValue');
    return this._boolean;
  }

  get singleNodeValue() {
    if (!SINGLE_TYPES.has(this._type)) throw this._wrongType('singleNodeValue');
    return this._single;
  }

  get snapshotLength() {
    if (!SNAPSHOT_TYPES.has(this._type)) throw this._wrongType('snapshotLength');
    return this._snapshot.length;
  }

  get invalidIteratorState() {
    if (!ITERATOR_TYPES.has(this._type)) throw this._wrongType('invalidIteratorState');
    // The DOM is immutable for the life of a result here, so iterators never
    // become invalid.
    return false;
  }

  iterateNext() {
    if (!ITERATOR_TYPES.has(this._type)) throw this._wrongType('iterateNext()');
    if (this._index >= this._nodes.length) return null;
    return this._nodes[this._index++];
  }

  snapshotItem(index) {
    if (!SNAPSHOT_TYPES.has(this._type)) throw this._wrongType('snapshotItem()');
    return index >= 0 && index < this._snapshot.length ? this._snapshot[index] : null;
  }
}

// Attach the numeric constants to both the class and instances (DOM exposes them
// in both places).
const RESULT_CONSTANTS = {
  ANY_TYPE,
  NUMBER_TYPE,
  STRING_TYPE,
  BOOLEAN_TYPE,
  UNORDERED_NODE_ITERATOR_TYPE,
  ORDERED_NODE_ITERATOR_TYPE,
  UNORDERED_NODE_SNAPSHOT_TYPE,
  ORDERED_NODE_SNAPSHOT_TYPE,
  ANY_UNORDERED_NODE_TYPE,
  FIRST_ORDERED_NODE_TYPE,
};
for (const [name, val] of Object.entries(RESULT_CONSTANTS)) {
  XPathResult[name] = val;
  XPathResult.prototype[name] = val;
}

// Bounded parse cache keyed by expression string (§7). XPath 1.0 is pure, so a
// parsed AST can be reused indefinitely. Capybara replays the same expressions
// many times, so this turns repeated parses into map lookups.
class ParseCache {
  constructor(limit) {
    this.limit = limit;
    this.map = new Map();
  }

  get(expression) {
    if (this.map.has(expression)) {
      const ast = this.map.get(expression);
      // Refresh recency (Map preserves insertion order).
      this.map.delete(expression);
      this.map.set(expression, ast);
      return ast;
    }
    const ast = parse(expression);
    this.map.set(expression, ast);
    if (this.map.size > this.limit) {
      this.map.delete(this.map.keys().next().value); // evict least-recently-used
    }
    return ast;
  }
}

// Wraps the adapter so stringValue is memoized for the life of one evaluation
// (§7). string-value is pure while the DOM is unchanged, so caching avoids
// re-walking the same subtree for every candidate node.
function memoizingAdapter(adapter) {
  const memo = new Map();
  const wrapper = Object.create(adapter);
  wrapper.stringValue = (node) => {
    if (memo.has(node)) return memo.get(node);
    const value = adapter.stringValue(node);
    memo.set(node, value);
    return value;
  };
  return wrapper;
}

function defaultExceptions() {
  return {
    // Native SyntaxError already reports name === 'SyntaxError'.
    syntaxError: (message) => new SyntaxError(message),
    typeError: (message) => new TypeError(message),
  };
}

function normalizeExceptions(provided) {
  const fallback = defaultExceptions();
  if (!provided) return fallback;
  return {
    syntaxError: provided.syntaxError ?? fallback.syntaxError,
    typeError: provided.typeError ?? fallback.typeError,
  };
}

// Translates internal errors to the host-facing exceptions (§4). Grammar errors
// become SyntaxError, everything else a TYPE_ERR-style error.
function mapError(error, exceptions) {
  if (error instanceof XPathSyntaxError) return exceptions.syntaxError(error.message);
  if (error instanceof XPathTypeError) return exceptions.typeError(error.message);
  return error;
}

// A parsed expression, reusable across context nodes (DOM XPathExpression).
class XPathExpression {
  constructor(ast, resolver, adapter, exceptions) {
    this._ast = ast;
    this._resolver = resolver ?? null;
    this._adapter = adapter;
    this._exceptions = exceptions;
  }

  // `result` (DOM's reuse-an-existing-XPathResult argument) is accepted for
  // signature parity but ignored — a fresh XPathResult is always returned.
  evaluate(contextNode, resultType = ANY_TYPE, result = null) { // eslint-disable-line no-unused-vars
    const adapter = memoizingAdapter(this._adapter);
    const ctx = makeRootContext(contextNode, adapter, { resolver: this._resolver });
    let value;
    try {
      value = evaluateExpr(this._ast, ctx);
    } catch (error) {
      throw mapError(error, this._exceptions);
    }
    return new XPathResult(value, resultType, adapter, this._exceptions);
  }
}

// Best-effort XPathNSResolver: resolves a prefix from xmlns declarations in
// scope of `node` (DOM createNSResolver). The `xml` prefix is always bound.
function makeNSResolver(node, adapter) {
  return {
    lookupNamespaceURI(prefix) {
      if (prefix === 'xml') return XML_NS;
      const wanted = prefix ? `xmlns:${prefix}` : 'xmlns';
      for (let n = node; n; n = adapter.parent(n)) {
        if (adapter.nodeType(n) !== ELEMENT) continue;
        for (const attr of adapter.attributes(n)) {
          // string-value of an attribute node is its value (§5).
          if (adapter.nodeName(attr) === wanted) return adapter.stringValue(attr);
        }
      }
      return null;
    },
  };
}

// Creates the public API bound to a DOM adapter. `options.exceptions` may inject
// host exception constructors ({ syntaxError, typeError }); `options.cacheSize`
// caps the parse cache.
export function createEvaluator(adapter, options = {}) {
  const exceptions = normalizeExceptions(options.exceptions);
  const cache = new ParseCache(options.cacheSize ?? 1000);

  function compile(expression, resolver) {
    let ast;
    try {
      ast = cache.get(expression);
    } catch (error) {
      throw mapError(error, exceptions);
    }
    // resolvePrefix() in nodetest.js accepts the DOM resolver forms (null, a
    // function, or an object with lookupNamespaceURI) directly.
    return new XPathExpression(ast, resolver ?? null, adapter, exceptions);
  }

  return {
    evaluate(expression, contextNode, resolver, resultType = ANY_TYPE, result = null) {
      return compile(expression, resolver).evaluate(contextNode, resultType, result);
    },
    createExpression(expression, resolver) {
      return compile(expression, resolver);
    },
    createNSResolver(node) {
      return makeNSResolver(node, adapter);
    },
  };
}
