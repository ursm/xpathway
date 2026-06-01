import {
  NodeSet, isNodeSet, toBoolean, toNumber, toStr, stringToNumber,
} from './types.js';
import { ELEMENT, ATTRIBUTE, PROCESSING_INSTRUCTION, XML_NS } from './node-types.js';
import { documentNodeOf } from './nodetest.js';
import { XPathTypeError } from './errors.js';

// XPath 1.0 core function library (REC §4). Each function is `fn(ctx, args)`,
// where `args` are already-evaluated XPath values (boolean | number | string |
// NodeSet). Functions read the context node / position / size from `ctx`.
//
// String functions (substring, string-length, translate) operate on UTF-16 code
// units, not Unicode code points. The pure XPath 1.0 text counts UCS characters,
// but the compatibility target is the browser, whose XPath works on DOMString
// (UTF-16) — §3 makes the observed Chromium behaviour authoritative.

function arity(name, args, min, max = min) {
  if (args.length < min || args.length > max) {
    const range = min === max ? `${min}` : `${min}-${max}`;
    throw new XPathTypeError(`${name}() expects ${range} argument(s), got ${args.length}`);
  }
}

function requireNodeSet(name, value) {
  if (!isNodeSet(value)) {
    throw new XPathTypeError(`${name}() requires a node-set argument`);
  }
  return value;
}

// The node a node-set function operates on: the first node (document order) of
// its node-set argument, or the context node when called with no argument.
function targetNode(name, ctx, args) {
  arity(name, args, 0, 1);
  if (args.length === 0) return ctx.node;
  return requireNodeSet(name, args[0]).first(ctx.adapter);
}

// string-value of the context-or-argument node (REC string()).
function targetString(name, ctx, args) {
  arity(name, args, 0, 1);
  if (args.length === 0) return ctx.adapter.stringValue(ctx.node);
  return toStr(args[0], ctx.adapter);
}

// XPath round(): nearest integer, ties toward +∞ (REC §4.4). NaN/±∞ pass through.
function xpathRound(x) {
  if (Number.isNaN(x) || x === Infinity || x === -Infinity) return x;
  return Math.floor(x + 0.5);
}

const WS_RUN = /[ \t\r\n]+/g;

function splitWhitespace(s) {
  return s.split(WS_RUN).filter((t) => t.length > 0);
}

export const coreFunctions = {
  // --- node-set (REC §4.1) -------------------------------------------------
  last: (ctx, args) => {
    arity('last', args, 0);
    return ctx.size;
  },
  position: (ctx, args) => {
    arity('position', args, 0);
    return ctx.position;
  },
  count: (ctx, args) => {
    arity('count', args, 1);
    return requireNodeSet('count', args[0]).size;
  },
  id: (ctx, args) => {
    arity('id', args, 1);
    const { adapter } = ctx;
    const doc = documentNodeOf(ctx.node, adapter);
    let tokens;
    if (isNodeSet(args[0])) {
      tokens = args[0].nodes.flatMap((n) => splitWhitespace(adapter.stringValue(n)));
    } else {
      tokens = splitWhitespace(toStr(args[0], adapter));
    }
    const seen = new Set();
    const nodes = [];
    for (const token of tokens) {
      const el = doc ? adapter.getElementById(doc, token) : null;
      if (el && !seen.has(el)) {
        seen.add(el);
        nodes.push(el);
      }
    }
    return new NodeSet(nodes, false);
  },
  'local-name': (ctx, args) => {
    const node = targetNode('local-name', ctx, args);
    if (node == null) return '';
    const type = ctx.adapter.nodeType(node);
    if (type === ELEMENT || type === ATTRIBUTE) return ctx.adapter.localName(node) ?? '';
    if (type === PROCESSING_INSTRUCTION) return ctx.adapter.nodeName(node) ?? '';
    return '';
  },
  'namespace-uri': (ctx, args) => {
    const node = targetNode('namespace-uri', ctx, args);
    if (node == null) return '';
    const type = ctx.adapter.nodeType(node);
    if (type === ELEMENT || type === ATTRIBUTE) return ctx.adapter.namespaceURI(node) ?? '';
    return '';
  },
  name: (ctx, args) => {
    const node = targetNode('name', ctx, args);
    if (node == null) return '';
    const type = ctx.adapter.nodeType(node);
    if (type === ELEMENT || type === ATTRIBUTE || type === PROCESSING_INSTRUCTION) {
      return ctx.adapter.nodeName(node) ?? '';
    }
    return '';
  },

  // --- string (REC §4.2) ---------------------------------------------------
  string: (ctx, args) => targetString('string', ctx, args),
  concat: (ctx, args) => {
    arity('concat', args, 2, Infinity);
    return args.map((a) => toStr(a, ctx.adapter)).join('');
  },
  'starts-with': (ctx, args) => {
    arity('starts-with', args, 2);
    return toStr(args[0], ctx.adapter).startsWith(toStr(args[1], ctx.adapter));
  },
  contains: (ctx, args) => {
    arity('contains', args, 2);
    return toStr(args[0], ctx.adapter).includes(toStr(args[1], ctx.adapter));
  },
  'substring-before': (ctx, args) => {
    arity('substring-before', args, 2);
    const s = toStr(args[0], ctx.adapter);
    const sub = toStr(args[1], ctx.adapter);
    const i = s.indexOf(sub);
    return i === -1 ? '' : s.slice(0, i);
  },
  'substring-after': (ctx, args) => {
    arity('substring-after', args, 2);
    const s = toStr(args[0], ctx.adapter);
    const sub = toStr(args[1], ctx.adapter);
    const i = s.indexOf(sub);
    return i === -1 ? '' : s.slice(i + sub.length);
  },
  substring: (ctx, args) => {
    arity('substring', args, 2, 3);
    const s = toStr(args[0], ctx.adapter);
    const lo = xpathRound(toNumber(args[1], ctx.adapter));
    // Characters at 1-based position p with lo <= p < hi.
    const hi = args.length === 3 ? lo + xpathRound(toNumber(args[2], ctx.adapter)) : Infinity;
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const p = i + 1;
      if (p >= lo && p < hi) out += s[i];
    }
    return out;
  },
  'string-length': (ctx, args) => targetString('string-length', ctx, args).length,
  'normalize-space': (ctx, args) => targetString('normalize-space', ctx, args)
    .replace(WS_RUN, ' ')
    .replace(/^ | $/g, ''),
  translate: (ctx, args) => {
    arity('translate', args, 3);
    const s = toStr(args[0], ctx.adapter);
    const from = toStr(args[1], ctx.adapter);
    const to = toStr(args[2], ctx.adapter);
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const j = from.indexOf(s[i]);
      if (j === -1) out += s[i];
      else if (j < to.length) out += to[j];
      // j >= to.length: character is removed
    }
    return out;
  },

  // --- boolean (REC §4.3) --------------------------------------------------
  boolean: (ctx, args) => {
    arity('boolean', args, 1);
    return toBoolean(args[0]);
  },
  not: (ctx, args) => {
    arity('not', args, 1);
    return !toBoolean(args[0]);
  },
  true: (ctx, args) => {
    arity('true', args, 0);
    return true;
  },
  false: (ctx, args) => {
    arity('false', args, 0);
    return false;
  },
  lang: (ctx, args) => {
    arity('lang', args, 1);
    const { adapter } = ctx;
    const target = toStr(args[0], adapter).toLowerCase();
    let lang = null;
    for (let node = ctx.node; node; node = adapter.parent(node)) {
      if (adapter.nodeType(node) === ELEMENT) {
        const value = adapter.getAttribute(node, XML_NS, 'lang');
        if (value != null) {
          lang = value.toLowerCase();
          break;
        }
      }
    }
    if (lang == null) return false;
    return lang === target || lang.startsWith(`${target}-`);
  },

  // --- number (REC §4.4) ---------------------------------------------------
  number: (ctx, args) => {
    arity('number', args, 0, 1);
    if (args.length === 0) return stringToNumber(ctx.adapter.stringValue(ctx.node));
    return toNumber(args[0], ctx.adapter);
  },
  sum: (ctx, args) => {
    arity('sum', args, 1);
    const ns = requireNodeSet('sum', args[0]);
    let total = 0;
    for (const node of ns.nodes) total += stringToNumber(ctx.adapter.stringValue(node));
    return total;
  },
  floor: (ctx, args) => {
    arity('floor', args, 1);
    return Math.floor(toNumber(args[0], ctx.adapter));
  },
  ceiling: (ctx, args) => {
    arity('ceiling', args, 1);
    return Math.ceil(toNumber(args[0], ctx.adapter));
  },
  round: (ctx, args) => {
    arity('round', args, 1);
    return xpathRound(toNumber(args[0], ctx.adapter));
  },
};
