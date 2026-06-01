# xpathway

A clean, standalone, **XPath 1.0**-compliant evaluation library in zero-dependency
ESM JavaScript. It implements the full XPath 1.0 language behind the browser's
DOM Level 3 XPath API (`document.evaluate` and friends) and runs against **any**
DOM through an injected adapter — no `Node` implementation is imported.

It exists primarily to replace the minified, unmaintained `wgxpath` blob in
[capybara-simulated](https://github.com/ursm/capybara-simulated), but the adapter
design keeps it reusable on top of any tree.

## Why

XPath 1.0 is a frozen spec (W3C REC 1999-11-16): implement it once, correctly,
and maintenance is essentially nil. This library does that with readable code, a
staged conformance test suite, and the performance work needed on a custom JS DOM
(see [Performance](#performance)).

## Install

```
npm install xpathway      # or pnpm add xpathway
```

Pure ESM, zero runtime dependencies, no Node built-ins — bundleable with esbuild
and runnable in a bare V8.

## Usage

Bind an evaluator to a DOM [adapter](#dom-adapter), then use it like `document`:

```js
import { createEvaluator, XPathResult } from 'xpathway';

const xpath = createEvaluator(adapter);

const result = xpath.evaluate(
  "//a[contains(normalize-space(string(.)), 'Sign in')]",
  contextNode,
  null,                                  // namespace resolver (or a function / XPathNSResolver)
  XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
);

for (let i = 0; i < result.snapshotLength; i++) {
  visit(result.snapshotItem(i));
}
```

`createEvaluator(adapter, options)` returns the DOM L3 XPath surface:

- `evaluate(expression, contextNode, resolver, resultType, result)` → `XPathResult`
- `createExpression(expression, resolver)` → a reusable `XPathExpression`
- `createNSResolver(node)` → an `XPathNSResolver` (`lookupNamespaceURI(prefix)`)

`XPathResult` carries the standard type constants and the
`numberValue` / `stringValue` / `booleanValue` / `singleNodeValue` /
`snapshotLength` / `snapshotItem()` / `iterateNext()` / `invalidIteratorState`
members. Accessing the wrong member for a result's type throws a `TypeError`.

### Options

- `exceptions` — inject host exception constructors so grammar errors and type
  errors become real host objects:
  `{ syntaxError(message), typeError(message) }`. Capybara passes wrappers that
  build `DOMException`s, so `err.name === 'SyntaxError'` holds for app JS. Without
  injection, native `SyntaxError` / `TypeError` are thrown.
- `cacheSize` — bound for the parse cache (default 1000).

## DOM adapter

The library never imports a node type. You supply an adapter implementing this
small contract (node handles are opaque to the library):

| Group | Operations |
|-------|------------|
| Kind | `nodeType(n)` — 1 element, 2 attribute, 3 text, 7 PI, 8 comment, 9 document |
| Tree | `parent(n)`, `childNodes(n)`, `ownerDocument(n)` |
| Names | `localName(n)`, `namespaceURI(n)`, `nodeName(n)` |
| Attributes | `attributes(el)`, `getAttribute(el, namespaceURI, localName)` |
| String value | `stringValue(n)` — XPath `string(node)` |
| Document order | `compareDocumentPosition(a, b)` — negative / 0 / positive |
| Id | `getElementById(doc, id)` |
| HTML | `isHtmlDocument(doc)` |

`nextSibling(n)` and `previousSibling(n)` are **optional** — supply them for the
sibling/`following`/`preceding` axes and they are used directly; otherwise they
are derived from `parent` + `childNodes`. See
[`test/helpers/dom.js`](test/helpers/dom.js) for a complete, minimal reference
adapter over a plain-object DOM.

## HTML semantics

In **HTML** documents (`isHtmlDocument` true), unprefixed element and attribute
name tests match `localName` ASCII case-insensitively, scoped to the XHTML
namespace for elements (foreign SVG/MathML content keeps standard rules). In
XML/XHTML documents, and for any prefixed test, matching is case-sensitive.

An adapter that reports an HTML document must key attributes case-insensitively
— in practice, store/look up HTML attribute names in lower case — so that
`getAttribute(el, null, 'type')` finds an attribute written `TYPE`. The library
relies on this for its `@name` fast path.

## Performance

XPath 1.0 evaluates over an immutable tree, which this library exploits:

- **Parse cache** keyed by expression string — repeated queries are lookups.
- **Absolute-path hoisting** — a context-independent `//label[@for = …]` inside a
  predicate is evaluated once per document, not once per candidate node.
- **String-value memoization** per evaluation.
- **Iterative axis traversal** — `descendant` / `following` / `preceding` never
  recurse, so deeply nested documents do not overflow the stack.

## Scope

Full XPath 1.0: all 13 axes, every node test, predicates, the complete operator
set and type system, and the full core function library. Out of scope (XPath
1.0 non-goals): XPath 2.0+, XSLT/XQuery, variable references, custom function
registration, and the `fn:` namespace. Namespace nodes and processing-instruction
nodes are not materialized by the target DOMs, so the `namespace::` axis and
`processing-instruction()` yield empty node-sets (the syntax still evaluates).

## Tests

```
npm test     # node --test
```

`test/conformance/` is the primary parity bar (an XPath 1.0 corpus plus the
real shapes Capybara's `xpath` gem emits). `test/wpt/` runs vendored
web-platform-tests XPath cases through a tiny zero-dependency testharness shim;
WPT's own XPath coverage is minimal, so this is a thin gate rather than the main
suite. `bench/bench.js` measures timing, scaling, and CPU hot spots.
