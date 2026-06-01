import { tokenize, T } from './src/lexer.js';

// The issue with "div div div":
// Per spec §3.7 rule 1:
// "If there is a preceding token and it is NOT one of `@`, `::`, `(`, `[`,
//  `,` or an Operator, then a `*` is a MultiplyOperator and a bare name is
//  an OperatorName (and/or/mod/div)."
//
// Token sequence: NAMETEST(div) DIV(div) NAMETEST(div)
// After NAMETEST(div): inOperatorPosition() = true, so "div" -> DIV ✓
// After DIV: inOperatorPosition() = false, so "div" -> NAMETEST ✓
//
// But the third "div" should be parsed as part of "div div div" operator
// sequence. Let's check what happens:

const tests = [
  { expr: 'a div b', label: 'a div b' },
  { expr: 'a div b div c', label: 'a div b div c' },
  { expr: 'div div div', label: 'div div div - problematic' },
  { expr: 'a and b and c', label: 'a and b and c' },
];

tests.forEach(({expr, label}) => {
  const tokens = tokenize(expr);
  console.log(`${label}`);
  console.log(`  "${expr}"`);
  console.log(`  ${tokens.slice(0, -1).map((t, i) => {
    let prefix = '';
    if (i === 0) prefix = 'start: ';
    else {
      const prev = tokens[i-1];
      const isAfterOperator = [T.AND, T.OR, T.DIV, T.MOD, T.MULTIPLY, T.PLUS, T.MINUS, 
                               T.EQ, T.NE, T.LT, T.LE, T.GT, T.GE, T.PIPE,
                               T.SLASH, T.DOUBLESLASH, T.LBRACKET, T.LPAREN, 
                               T.COMMA, T.AT, T.DOUBLECOLON].includes(prev.type);
      prefix = isAfterOperator ? 'after-op: ' : 'after-val: ';
    }
    return prefix + t.type;
  }).join(' | ')}`);
  console.log();
});
