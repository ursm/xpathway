import { NodeSet, isNodeSet, toBoolean, toNumber, toStr, stringToNumber } from './types.js';

// Comparison operators (REC §3.4). The defining subtlety is that comparisons
// involving node-sets are *existentially quantified*: `A = B` is true iff there
// exists a node (or value) on each side making the underlying comparison true.
// In particular `A != B` is NOT `!(A = B)` — it is "exists a pair that differs".

const EQ_TESTS = {
  '=': (x, y) => x === y,
  '!=': (x, y) => x !== y,
};

const REL_TESTS = {
  '<': (x, y) => x < y,
  '<=': (x, y) => x <= y,
  '>': (x, y) => x > y,
  '>=': (x, y) => x >= y,
};

// `=` and `!=` (REC §3.4, first three paragraphs).
export function compareEquality(op, a, b, adapter) {
  const test = EQ_TESTS[op];

  // Both node-sets: existential over pairs, comparing string-values.
  if (isNodeSet(a) && isNodeSet(b)) {
    const bStrings = b.nodes.map((n) => adapter.stringValue(n));
    for (const n of a.nodes) {
      const s = adapter.stringValue(n);
      for (const bs of bStrings) {
        if (test(s, bs)) return true;
      }
    }
    return false;
  }

  // Exactly one node-set: convert per the other operand's type.
  if (isNodeSet(a) || isNodeSet(b)) {
    const ns = isNodeSet(a) ? a : b;
    const other = isNodeSet(a) ? b : a;

    // node-set vs boolean: compare booleans (node-set -> boolean).
    if (typeof other === 'boolean') {
      return test(toBoolean(ns), other);
    }
    // node-set vs number: exists node whose numeric string-value compares true.
    if (typeof other === 'number') {
      for (const n of ns.nodes) {
        if (test(stringToNumber(adapter.stringValue(n)), other)) return true;
      }
      return false;
    }
    // node-set vs string: exists node whose string-value compares true.
    const str = String(other);
    for (const n of ns.nodes) {
      if (test(adapter.stringValue(n), str)) return true;
    }
    return false;
  }

  // Neither is a node-set: boolean > number > string precedence (REC §3.4).
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return test(toBoolean(a), toBoolean(b));
  }
  if (typeof a === 'number' || typeof b === 'number') {
    return test(toNumber(a, adapter), toNumber(b, adapter));
  }
  return test(toStr(a, adapter), toStr(b, adapter));
}

// `<`, `<=`, `>`, `>=` (REC §3.4, last paragraph): both sides become numbers,
// node-sets contributing the numeric value of each member's string-value.
export function compareRelational(op, a, b, adapter) {
  const test = REL_TESTS[op];
  const left = numericValues(a, adapter);
  const right = numericValues(b, adapter);
  for (const x of left) {
    for (const y of right) {
      if (test(x, y)) return true;
    }
  }
  return false;
}

function numericValues(value, adapter) {
  if (isNodeSet(value)) {
    return value.nodes.map((n) => stringToNumber(adapter.stringValue(n)));
  }
  return [toNumber(value, adapter)];
}

// Compares a single string `value` (e.g. an attribute's value) against a literal
// operand, with exactly the semantics compareEquality/compareRelational would
// apply to a one-node node-set vs that primitive (REC §3.4). `literal` is a
// string (string comparison for =/!=) or a number (numeric comparison). Used by
// the attribute-comparison fast path; callers pass the operator already oriented
// so `value` is the left-hand side.
export function compareValueLiteral(op, value, literal) {
  if (op === '=' || op === '!=') {
    const equal = typeof literal === 'number'
      ? stringToNumber(value) === literal
      : value === literal;
    return op === '=' ? equal : !equal;
  }
  const a = stringToNumber(value);
  const b = typeof literal === 'number' ? literal : stringToNumber(literal);
  return REL_TESTS[op](a, b);
}
