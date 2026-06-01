import { XPathSyntaxError } from './errors.js';

// Tokenizer for XPath 1.0 expressions (W3C REC §3.7, "Lexical Structure").
//
// The interesting part is the context-sensitive disambiguation of `*` and of
// bare names (`and` / `or` / `mod` / `div`, axis names, node types, function
// names, name tests). The spec resolves these with three rules:
//
//   1. If there is a preceding token and it is NOT one of `@`, `::`, `(`, `[`,
//      `,` or an Operator, then a `*` is a MultiplyOperator and a bare name is
//      an OperatorName (and/or/mod/div).
//   2. If a name is immediately followed (skipping whitespace) by `(`, it is a
//      NodeType (node/text/comment/processing-instruction) or a FunctionName.
//   3. If a name is immediately followed (skipping whitespace) by `::`, it is
//      an AxisName.
//
// We resolve all of this here so the parser sees unambiguous, typed tokens.

// Token types produced by the lexer.
export const T = {
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  LBRACKET: 'LBRACKET',
  RBRACKET: 'RBRACKET',
  AT: 'AT',
  COMMA: 'COMMA',
  DOUBLECOLON: 'DOUBLECOLON',
  SLASH: 'SLASH',
  DOUBLESLASH: 'DOUBLESLASH',
  DOT: 'DOT',
  DOTDOT: 'DOTDOT',
  PIPE: 'PIPE',
  PLUS: 'PLUS',
  MINUS: 'MINUS',
  EQ: 'EQ',
  NE: 'NE',
  LT: 'LT',
  LE: 'LE',
  GT: 'GT',
  GE: 'GE',
  MULTIPLY: 'MULTIPLY',
  AND: 'AND',
  OR: 'OR',
  MOD: 'MOD',
  DIV: 'DIV',
  AXISNAME: 'AXISNAME',
  NODETYPE: 'NODETYPE',
  FUNCNAME: 'FUNCNAME',
  NAMETEST: 'NAMETEST', // value: { prefix: string|null, local: string|'*' }
  NUMBER: 'NUMBER',
  LITERAL: 'LITERAL',
  VARREF: 'VARREF',
  EOF: 'EOF',
};

// After one of these token types, a `*` / bare name is forced to be a NAME
// (name test / axis / function / node type) rather than an operator. This is
// the complement of rule 1: the set of `@`, `::`, `(`, `[`, `,` and Operators.
const FORCE_NAME_AFTER = new Set([
  T.AT, T.DOUBLECOLON, T.LPAREN, T.LBRACKET, T.COMMA,
  T.SLASH, T.DOUBLESLASH, T.PIPE, T.PLUS, T.MINUS,
  T.EQ, T.NE, T.LT, T.LE, T.GT, T.GE,
  T.MULTIPLY, T.AND, T.OR, T.MOD, T.DIV,
]);

const OPERATOR_NAMES = new Map([
  ['and', T.AND],
  ['or', T.OR],
  ['mod', T.MOD],
  ['div', T.DIV],
]);

const NODE_TYPES = new Set(['node', 'text', 'comment', 'processing-instruction']);

function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

// XML NameStartChar (sans ':'), pragmatically: ASCII letters / underscore, plus
// any non-ASCII code point (covers Unicode element names without a full table).
function isNameStart(ch) {
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_' || ch.charCodeAt(0) >= 0x80;
}

// XML NameChar (sans ':'). The >= 0x80 branch in isNameStart already covers the
// non-ASCII NameChar additions (combining marks, U+00B7, etc.).
function isNameChar(ch) {
  return isNameStart(ch) || isDigit(ch) || ch === '-' || ch === '.';
}

function isWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';
}

export function tokenize(expr) {
  if (typeof expr !== 'string') {
    throw new XPathSyntaxError('expression must be a string');
  }

  const tokens = [];
  let i = 0;
  const n = expr.length;

  const prevType = () => (tokens.length ? tokens[tokens.length - 1].type : null);
  const inOperatorPosition = () => tokens.length > 0 && !FORCE_NAME_AFTER.has(prevType());

  const push = (type, value, pos) => tokens.push({ type, value, pos });

  // Index of the next non-whitespace char at or after `from`.
  const skipWs = (from) => {
    let j = from;
    while (j < n && isWhitespace(expr[j])) j++;
    return j;
  };

  while (i < n) {
    const ch = expr[i];

    if (isWhitespace(ch)) {
      i++;
      continue;
    }

    const start = i;

    // Multi-character operators first.
    if (ch === '/') {
      if (expr[i + 1] === '/') {
        push(T.DOUBLESLASH, '//', start);
        i += 2;
      } else {
        push(T.SLASH, '/', start);
        i += 1;
      }
      continue;
    }
    if (ch === '!') {
      if (expr[i + 1] === '=') {
        push(T.NE, '!=', start);
        i += 2;
        continue;
      }
      throw new XPathSyntaxError("unexpected '!'", start);
    }
    if (ch === '<') {
      if (expr[i + 1] === '=') {
        push(T.LE, '<=', start);
        i += 2;
      } else {
        push(T.LT, '<', start);
        i += 1;
      }
      continue;
    }
    if (ch === '>') {
      if (expr[i + 1] === '=') {
        push(T.GE, '>=', start);
        i += 2;
      } else {
        push(T.GT, '>', start);
        i += 1;
      }
      continue;
    }
    if (ch === '=') {
      push(T.EQ, '=', start);
      i += 1;
      continue;
    }
    if (ch === '|') {
      push(T.PIPE, '|', start);
      i += 1;
      continue;
    }
    if (ch === '+') {
      push(T.PLUS, '+', start);
      i += 1;
      continue;
    }
    if (ch === '-') {
      push(T.MINUS, '-', start);
      i += 1;
      continue;
    }
    if (ch === '(') {
      push(T.LPAREN, '(', start);
      i += 1;
      continue;
    }
    if (ch === ')') {
      push(T.RPAREN, ')', start);
      i += 1;
      continue;
    }
    if (ch === '[') {
      push(T.LBRACKET, '[', start);
      i += 1;
      continue;
    }
    if (ch === ']') {
      push(T.RBRACKET, ']', start);
      i += 1;
      continue;
    }
    if (ch === ',') {
      push(T.COMMA, ',', start);
      i += 1;
      continue;
    }
    if (ch === '@') {
      push(T.AT, '@', start);
      i += 1;
      continue;
    }
    if (ch === ':' && expr[i + 1] === ':') {
      push(T.DOUBLECOLON, '::', start);
      i += 2;
      continue;
    }

    // String literals.
    if (ch === '"' || ch === "'") {
      i += 1;
      let value = '';
      while (i < n && expr[i] !== ch) {
        value += expr[i];
        i += 1;
      }
      if (i >= n) {
        throw new XPathSyntaxError('unterminated string literal', start);
      }
      i += 1; // closing quote
      push(T.LITERAL, value, start);
      continue;
    }

    // Numbers: Digits ('.' Digits?)? | '.' Digits
    if (isDigit(ch) || (ch === '.' && isDigit(expr[i + 1]))) {
      let value = '';
      while (i < n && isDigit(expr[i])) {
        value += expr[i];
        i += 1;
      }
      // Consume a decimal point, but not the first `.` of a `..` (parent) token.
      if (expr[i] === '.' && expr[i + 1] !== '.') {
        value += '.';
        i += 1;
        while (i < n && isDigit(expr[i])) {
          value += expr[i];
          i += 1;
        }
      }
      push(T.NUMBER, Number(value), start);
      continue;
    }

    // `.` (self) and `..` (parent).
    if (ch === '.') {
      if (expr[i + 1] === '.') {
        push(T.DOTDOT, '..', start);
        i += 2;
      } else {
        push(T.DOT, '.', start);
        i += 1;
      }
      continue;
    }

    // `$QName` variable reference (parsed, but unsupported at eval — §12).
    if (ch === '$') {
      i += 1;
      const name = readQNameString(expr, i);
      if (name == null) {
        throw new XPathSyntaxError('expected name after \'$\'', start);
      }
      i = name.end;
      push(T.VARREF, name.value, start);
      continue;
    }

    // `*` — multiply operator or name test, per rule 1.
    if (ch === '*') {
      if (inOperatorPosition()) {
        push(T.MULTIPLY, '*', start);
      } else {
        push(T.NAMETEST, { prefix: null, local: '*' }, start);
      }
      i += 1;
      continue;
    }

    // Names: NCName, QName, `prefix:*`, plus axis / node-type / function /
    // operator-name disambiguation.
    if (isNameStart(ch)) {
      const parsed = readName(expr, i);
      i = parsed.end;
      const { prefix, local } = parsed;

      // Look past whitespace to see what follows.
      const after = skipWs(i);
      const followedByParen = expr[after] === '(';
      const followedByDoubleColon = expr[after] === ':' && expr[after + 1] === ':';

      if (followedByDoubleColon && prefix == null && local !== '*') {
        push(T.AXISNAME, local, start);
        continue;
      }

      if (followedByParen && prefix == null && local !== '*') {
        if (NODE_TYPES.has(local)) {
          push(T.NODETYPE, local, start);
        } else {
          push(T.FUNCNAME, { prefix: null, local }, start);
        }
        continue;
      }
      if (followedByParen && prefix != null) {
        push(T.FUNCNAME, { prefix, local }, start);
        continue;
      }

      // Operator name (and/or/mod/div) only in operator position.
      if (prefix == null && local !== '*' && inOperatorPosition() && OPERATOR_NAMES.has(local)) {
        push(OPERATOR_NAMES.get(local), local, start);
        continue;
      }

      push(T.NAMETEST, { prefix, local }, start);
      continue;
    }

    throw new XPathSyntaxError(`unexpected character '${ch}'`, start);
  }

  push(T.EOF, null, n);
  return tokens;
}

// Index past the NCName starting at `start` (assumes isNameStart(expr[start])).
function ncNameEnd(expr, start) {
  const n = expr.length;
  let i = start + 1;
  while (i < n && isNameChar(expr[i])) i++;
  return i;
}

// Reads a (possibly prefixed) name starting at `start`; returns { value, end }
// or null. Used for `$QName` variable references.
function readQNameString(expr, start) {
  if (start >= expr.length || !isNameStart(expr[start])) return null;
  let i = ncNameEnd(expr, start);
  // Optional `:local` for a prefixed variable name.
  if (expr[i] === ':' && expr[i + 1] !== ':' && isNameStart(expr[i + 1] ?? '')) {
    i = ncNameEnd(expr, i + 1);
  }
  return { value: expr.slice(start, i), end: i };
}

// Reads a NameTest body: NCName, `NCName:local`, or `NCName:*`.
// Returns { prefix: string|null, local: string|'*', end }.
function readName(expr, start) {
  const i = ncNameEnd(expr, start);
  const first = expr.slice(start, i);

  // A `:` that is not `::` introduces a QName local part (or `*`).
  if (expr[i] === ':' && expr[i + 1] !== ':') {
    if (expr[i + 1] === '*') {
      return { prefix: first, local: '*', end: i + 2 };
    }
    if (isNameStart(expr[i + 1] ?? '')) {
      const j = ncNameEnd(expr, i + 1);
      return { prefix: first, local: expr.slice(i + 1, j), end: j };
    }
    throw new XPathSyntaxError(`expected name after ':' in '${first}:'`, i);
  }

  return { prefix: null, local: first, end: i };
}
