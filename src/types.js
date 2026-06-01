import { XPathTypeError } from './errors.js';

// The four XPath 1.0 value types (REC §1):
//   - boolean  -> JS boolean
//   - number   -> JS number (IEEE 754 double)
//   - string   -> JS string
//   - node-set -> NodeSet (below)
//
// Nodes themselves are opaque handles supplied by the host; every structural
// operation goes through the injected DOM adapter (§5), so this module only
// ever asks the adapter for a node's string-value.

// A set of nodes. Internally an array plus a `sorted` flag: many node-sets are
// produced already in document order (a single axis step), so we avoid re-sorting
// when we can, and sort lazily (via the adapter) only when order is observable
// (string-value, snapshots, iteration, position predicates).
export class NodeSet {
  // A NodeSet takes ownership of `nodes`: ordered() sorts it in place, so the
  // caller must not retain or share the array. Pass `sorted: true` only when the
  // array is already in document order (e.g. a single forward-axis step).
  constructor(nodes = [], sorted = false) {
    this.nodes = nodes;
    this.sorted = sorted;
  }

  get size() {
    return this.nodes.length;
  }

  // Returns the nodes in document order, sorting in place on first need.
  ordered(adapter) {
    if (!this.sorted) {
      this.nodes.sort((a, b) => adapter.compareDocumentPosition(a, b));
      this.sorted = true;
    }
    return this.nodes;
  }

  // The first node in document order, or null for the empty set.
  first(adapter) {
    if (this.nodes.length === 0) return null;
    if (this.sorted) return this.nodes[0];
    let best = this.nodes[0];
    for (let i = 1; i < this.nodes.length; i++) {
      if (adapter.compareDocumentPosition(this.nodes[i], best) < 0) best = this.nodes[i];
    }
    return best;
  }
}

export function isNodeSet(v) {
  return v instanceof NodeSet;
}

// --- Conversions (REC §3.3 booleans, §3.4 numbers, §3.5 strings) ---------

// boolean(object) — REC §4.3.
export function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  if (typeof value === 'string') return value.length > 0;
  if (isNodeSet(value)) return value.size > 0;
  throw new XPathTypeError(`cannot convert ${describe(value)} to boolean`);
}

// number(object) — REC §4.4.
export function toNumber(value, adapter) {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') return stringToNumber(value);
  if (isNodeSet(value)) return stringToNumber(nodeSetString(value, adapter));
  throw new XPathTypeError(`cannot convert ${describe(value)} to number`);
}

// string(object) — REC §4.2.
export function toStr(value, adapter) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return numberToString(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (isNodeSet(value)) return nodeSetString(value, adapter);
  throw new XPathTypeError(`cannot convert ${describe(value)} to string`);
}

// string-value of a node-set is the string-value of its first node in document
// order, or '' for the empty set (REC §4.2).
export function nodeSetString(ns, adapter) {
  const node = ns.first(adapter);
  return node == null ? '' : adapter.stringValue(node);
}

function describe(value) {
  return value === null ? 'null' : typeof value;
}

// --- number <-> string per spec, avoiding JS exponential notation ---------

// XPath whitespace is exactly #x20 | #x9 | #xD | #xA (NOT JS's broader \s).
const XPATH_WS = /^[ \t\r\n]+|[ \t\r\n]+$/g;
// Number ::= Digits ('.' Digits?)? | '.' Digits, optionally signed with '-'.
const NUMBER_RE = /^-?(\d+(\.\d*)?|\.\d+)$/;

export function stringToNumber(s) {
  const trimmed = s.replace(XPATH_WS, '');
  if (!NUMBER_RE.test(trimmed)) return NaN;
  return Number(trimmed);
}

// number -> string (REC §4.2): no exponent, no superfluous leading/trailing
// zeros, integers without a decimal point.
export function numberToString(n) {
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return 'Infinity';
  if (n === -Infinity) return '-Infinity';
  if (n === 0) return '0'; // also normalises -0

  const s = String(n);
  if (s.indexOf('e') === -1 && s.indexOf('E') === -1) return s;
  return expandExponential(s);
}

// Expands JS exponential notation (e.g. "1e+21", "1.5e-7") into a plain decimal
// string. JS only emits exponents for magnitudes >= 1e21 or < 1e-6.
function expandExponential(input) {
  let s = input;
  const negative = s[0] === '-';
  if (negative) s = s.slice(1);

  const [mantissa, expPart] = s.split(/[eE]/);
  const exp = Number(expPart);
  const [intPart, fracPart = ''] = mantissa.split('.');
  const digits = intPart + fracPart;
  const pointPos = intPart.length + exp; // decimal point offset within `digits`

  let result;
  if (pointPos <= 0) {
    result = `0.${'0'.repeat(-pointPos)}${digits}`;
  } else if (pointPos >= digits.length) {
    result = digits + '0'.repeat(pointPos - digits.length);
  } else {
    result = `${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`;
  }
  return negative ? `-${result}` : result;
}
