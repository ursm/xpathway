import { tokenize, T } from './lexer.js';
import { optimize } from './optimize.js';
import { XPathSyntaxError } from './errors.js';

// Recursive-descent parser for XPath 1.0 (W3C REC §3, grammar productions
// [1]–[27]). Produces a plain-object AST consumed by the evaluator.
//
// AST node shapes:
//   { type: 'Path', root, steps }          root: null (context) | {type:'Root'} | <expr>
//   { type: 'Step', axis, nodeTest, predicates }
//     nodeTest: { kind: 'name', prefix, local } | { kind: 'type', name, literal }
//   { type: 'Filter', primary, predicates }
//   { type: 'Binary', op, left, right }     op: or|and|=|!=|<|<=|>|>=|+|-|*|div|mod|union
//   { type: 'Unary', operand }              negation
//   { type: 'Function', prefix, name, args }
//   { type: 'Literal', value }
//   { type: 'Number', value }

export const AXES = new Set([
  'ancestor', 'ancestor-or-self', 'attribute', 'child', 'descendant',
  'descendant-or-self', 'following', 'following-sibling', 'namespace',
  'parent', 'preceding', 'preceding-sibling', 'self',
]);

const STEP_START = new Set([T.AT, T.AXISNAME, T.NAMETEST, T.NODETYPE, T.DOT, T.DOTDOT]);
const PRIMARY_START = new Set([T.LPAREN, T.LITERAL, T.NUMBER, T.FUNCNAME, T.VARREF]);

// Operator maps per precedence level (hoisted so they are allocated once, not
// rebuilt on every parse call).
const OR_OPS = { [T.OR]: 'or' };
const AND_OPS = { [T.AND]: 'and' };
const EQUALITY_OPS = { [T.EQ]: '=', [T.NE]: '!=' };
const RELATIONAL_OPS = { [T.LT]: '<', [T.LE]: '<=', [T.GT]: '>', [T.GE]: '>=' };
const ADDITIVE_OPS = { [T.PLUS]: '+', [T.MINUS]: '-' };
const MULTIPLICATIVE_OPS = { [T.MULTIPLY]: '*', [T.DIV]: 'div', [T.MOD]: 'mod' };

// A no-predicate step over a node-type test (self::node(), parent::node(),
// descendant-or-self::node()). Returns a fresh object each call so steps never
// share mutable state.
function nodeTypeStep(axis, name) {
  return { type: 'Step', axis, nodeTest: { kind: 'type', name, literal: null }, predicates: [] };
}

// `//` desugars to `/descendant-or-self::node()/` (REC §2.5).
function descendantOrSelfStep() {
  return nodeTypeStep('descendant-or-self', 'node');
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos];
  }

  next() {
    return this.tokens[this.pos++];
  }

  is(type) {
    return this.tokens[this.pos].type === type;
  }

  expect(type) {
    const tok = this.tokens[this.pos];
    if (tok.type !== type) {
      throw new XPathSyntaxError(`expected ${type} but found ${tok.type}`, tok.pos);
    }
    return this.next();
  }

  parse() {
    const expr = this.parseExpr();
    if (!this.is(T.EOF)) {
      const tok = this.peek();
      throw new XPathSyntaxError(`unexpected trailing token ${tok.type}`, tok.pos);
    }
    return expr;
  }

  // Expr ::= OrExpr
  parseExpr() {
    return this.parseOr();
  }

  parseBinaryLeft(subParse, opMap) {
    let left = subParse.call(this);
    for (;;) {
      const op = opMap[this.peek().type];
      if (!op) return left;
      this.next();
      const right = subParse.call(this);
      left = { type: 'Binary', op, left, right };
    }
  }

  parseOr() {
    return this.parseBinaryLeft(this.parseAnd, OR_OPS);
  }

  parseAnd() {
    return this.parseBinaryLeft(this.parseEquality, AND_OPS);
  }

  parseEquality() {
    return this.parseBinaryLeft(this.parseRelational, EQUALITY_OPS);
  }

  parseRelational() {
    return this.parseBinaryLeft(this.parseAdditive, RELATIONAL_OPS);
  }

  parseAdditive() {
    return this.parseBinaryLeft(this.parseMultiplicative, ADDITIVE_OPS);
  }

  parseMultiplicative() {
    return this.parseBinaryLeft(this.parseUnary, MULTIPLICATIVE_OPS);
  }

  // UnaryExpr ::= UnionExpr | '-' UnaryExpr
  parseUnary() {
    if (this.is(T.MINUS)) {
      this.next();
      return { type: 'Unary', operand: this.parseUnary() };
    }
    return this.parseUnion();
  }

  // UnionExpr ::= PathExpr ('|' PathExpr)*
  parseUnion() {
    let left = this.parsePathExpr();
    while (this.is(T.PIPE)) {
      this.next();
      const right = this.parsePathExpr();
      left = { type: 'Binary', op: 'union', left, right };
    }
    return left;
  }

  // PathExpr ::= LocationPath | FilterExpr (('/' | '//') RelativeLocationPath)?
  parsePathExpr() {
    if (PRIMARY_START.has(this.peek().type)) {
      const primary = this.parseFilterExpr();
      if (this.is(T.SLASH) || this.is(T.DOUBLESLASH)) {
        const steps = [];
        if (this.is(T.DOUBLESLASH)) steps.push(descendantOrSelfStep());
        this.next();
        this.parseRelativeSteps(steps);
        return { type: 'Path', root: primary, steps };
      }
      return primary;
    }
    return this.parseLocationPath();
  }

  // LocationPath ::= RelativeLocationPath | AbsoluteLocationPath
  parseLocationPath() {
    if (this.is(T.SLASH)) {
      this.next();
      const steps = [];
      if (STEP_START.has(this.peek().type)) this.parseRelativeSteps(steps);
      return { type: 'Path', root: { type: 'Root' }, steps };
    }
    if (this.is(T.DOUBLESLASH)) {
      this.next();
      const steps = [descendantOrSelfStep()];
      this.parseRelativeSteps(steps);
      return { type: 'Path', root: { type: 'Root' }, steps };
    }
    const steps = [];
    this.parseRelativeSteps(steps);
    return { type: 'Path', root: null, steps };
  }

  // RelativeLocationPath ::= Step (('/' | '//') Step)*
  parseRelativeSteps(steps) {
    steps.push(this.parseStep());
    for (;;) {
      if (this.is(T.SLASH)) {
        this.next();
        steps.push(this.parseStep());
      } else if (this.is(T.DOUBLESLASH)) {
        this.next();
        steps.push(descendantOrSelfStep());
        steps.push(this.parseStep());
      } else {
        return steps;
      }
    }
  }

  // Step ::= AxisSpecifier NodeTest Predicate* | AbbreviatedStep
  parseStep() {
    if (this.is(T.DOT)) {
      this.next();
      return nodeTypeStep('self', 'node');
    }
    if (this.is(T.DOTDOT)) {
      this.next();
      return nodeTypeStep('parent', 'node');
    }

    let axis = 'child';
    if (this.is(T.AT)) {
      this.next();
      axis = 'attribute';
    } else if (this.is(T.AXISNAME)) {
      const name = this.next().value;
      if (!AXES.has(name)) {
        throw new XPathSyntaxError(`unknown axis '${name}'`, this.tokens[this.pos - 1].pos);
      }
      this.expect(T.DOUBLECOLON);
      axis = name;
    }

    const nodeTest = this.parseNodeTest();
    const predicates = this.parsePredicates();
    return { type: 'Step', axis, nodeTest, predicates };
  }

  // NodeTest ::= NameTest | NodeType '(' ')' | 'processing-instruction' '(' Literal ')'
  parseNodeTest() {
    if (this.is(T.NODETYPE)) {
      const name = this.next().value;
      this.expect(T.LPAREN);
      let literal = null;
      if (name === 'processing-instruction' && this.is(T.LITERAL)) {
        literal = this.next().value;
      }
      this.expect(T.RPAREN);
      return { kind: 'type', name, literal };
    }
    if (this.is(T.NAMETEST)) {
      const { prefix, local } = this.next().value;
      return { kind: 'name', prefix, local };
    }
    const tok = this.peek();
    throw new XPathSyntaxError(`expected a node test but found ${tok.type}`, tok.pos);
  }

  // Predicate* ::= ('[' Expr ']')*
  parsePredicates() {
    const predicates = [];
    while (this.is(T.LBRACKET)) {
      this.next();
      predicates.push(this.parseExpr());
      this.expect(T.RBRACKET);
    }
    return predicates;
  }

  // FilterExpr ::= PrimaryExpr Predicate*
  parseFilterExpr() {
    const primary = this.parsePrimary();
    const predicates = this.parsePredicates();
    if (predicates.length === 0) return primary;
    return { type: 'Filter', primary, predicates };
  }

  // PrimaryExpr ::= VariableReference | '(' Expr ')' | Literal | Number | FunctionCall
  parsePrimary() {
    const tok = this.peek();
    switch (tok.type) {
      case T.VARREF:
        // §12: variable references are an explicit non-goal.
        throw new XPathSyntaxError(`variable references are not supported ($${tok.value})`, tok.pos);
      case T.LPAREN: {
        this.next();
        const expr = this.parseExpr();
        this.expect(T.RPAREN);
        return expr;
      }
      case T.LITERAL:
        this.next();
        return { type: 'Literal', value: tok.value };
      case T.NUMBER:
        this.next();
        return { type: 'Number', value: tok.value };
      case T.FUNCNAME:
        return this.parseFunctionCall();
      default:
        throw new XPathSyntaxError(`unexpected token ${tok.type}`, tok.pos);
    }
  }

  // FunctionCall ::= FunctionName '(' (Argument (',' Argument)*)? ')'
  parseFunctionCall() {
    const { prefix, local } = this.next().value;
    this.expect(T.LPAREN);
    const args = [];
    if (!this.is(T.RPAREN)) {
      args.push(this.parseExpr());
      while (this.is(T.COMMA)) {
        this.next();
        args.push(this.parseExpr());
      }
    }
    this.expect(T.RPAREN);
    return { type: 'Function', prefix: prefix ?? null, name: local, args };
  }
}

export function parse(expr) {
  // The parser produces the literal grammar tree; optimize() then applies
  // REC-preserving normalizations (e.g. fusing `//`'s step pair into a single
  // `descendant` step) once, before the AST is cached and replayed (§7).
  return optimize(new Parser(tokenize(expr)).parse());
}
