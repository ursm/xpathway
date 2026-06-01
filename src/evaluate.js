import { NodeSet, isNodeSet, toBoolean, toNumber } from './types.js';
import { compareEquality, compareRelational } from './compare.js';
import { XPathTypeError } from './errors.js';

// Core expression evaluator. Given an AST node and an evaluation context, returns
// an XPath value (boolean | number | string | NodeSet).
//
// Context shape:
//   { node, position, size, adapter, resolver, functions }
//   - node      : the context node (opaque host handle)
//   - position  : 1-based context position
//   - size      : context size
//   - adapter   : the injected DOM adapter (§5)
//   - resolver  : namespace prefix -> URI lookup (or null)
//   - functions : function-library table (wired in Stage 4)
//
// Location paths, filter expressions, and function calls are evaluated by later
// stages; until then they raise a clear "not implemented" error so partial
// builds fail loudly rather than silently.

export function evaluate(ast, ctx) {
  switch (ast.type) {
    case 'Literal':
      return ast.value;
    case 'Number':
      return ast.value;
    case 'Unary':
      return -toNumber(evaluate(ast.operand, ctx), ctx.adapter);
    case 'Binary':
      return evaluateBinary(ast, ctx);
    case 'Path':
      return evaluatePath(ast, ctx);
    case 'Filter':
      return evaluateFilter(ast, ctx);
    case 'Function':
      return evaluateFunction(ast, ctx);
    default:
      throw new XPathTypeError(`unknown AST node type '${ast.type}'`);
  }
}

const ARITHMETIC = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  'div': (a, b) => a / b,
  // XPath `mod` is a truncating remainder, which is exactly JS `%`.
  'mod': (a, b) => a % b,
};

function evaluateBinary(ast, ctx) {
  const { op } = ast;

  // Logical operators short-circuit (REC §3.4).
  if (op === 'or') {
    return toBoolean(evaluate(ast.left, ctx)) || toBoolean(evaluate(ast.right, ctx));
  }
  if (op === 'and') {
    return toBoolean(evaluate(ast.left, ctx)) && toBoolean(evaluate(ast.right, ctx));
  }

  if (op === 'union') {
    const left = evaluate(ast.left, ctx);
    const right = evaluate(ast.right, ctx);
    if (!isNodeSet(left) || !isNodeSet(right)) {
      throw new XPathTypeError('union operand is not a node-set');
    }
    return unionNodeSets(left, right);
  }

  const left = evaluate(ast.left, ctx);
  const right = evaluate(ast.right, ctx);

  if (op === '=' || op === '!=') {
    return compareEquality(op, left, right, ctx.adapter);
  }
  if (op === '<' || op === '<=' || op === '>' || op === '>=') {
    return compareRelational(op, left, right, ctx.adapter);
  }

  const arith = ARITHMETIC[op];
  return arith(toNumber(left, ctx.adapter), toNumber(right, ctx.adapter));
}

// Set union by node identity; document order is established lazily when observed.
export function unionNodeSets(a, b) {
  const seen = new Set(a.nodes);
  const nodes = a.nodes.slice();
  for (const n of b.nodes) {
    if (!seen.has(n)) {
      seen.add(n);
      nodes.push(n);
    }
  }
  return new NodeSet(nodes, false);
}

function evaluatePath() {
  throw new XPathTypeError('location path evaluation is implemented in Stage 3');
}

function evaluateFilter() {
  throw new XPathTypeError('filter expression evaluation is implemented in Stage 3');
}

function evaluateFunction() {
  throw new XPathTypeError('function calls are implemented in Stage 4');
}
