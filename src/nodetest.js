import {
  ELEMENT, ATTRIBUTE, TEXT, PROCESSING_INSTRUCTION, COMMENT, DOCUMENT, XML_NS, XHTML_NS,
} from './node-types.js';
import { XPathTypeError } from './errors.js';

// Node tests (REC §2.3) plus the HTML compatibility layer (§6).

// Principal node type of an axis: attribute for the attribute axis, element for
// all others (REC §2.3). The namespace axis never reaches here — it is handled
// (as always-empty) before any name test runs.
function principalType(axis) {
  return axis === 'attribute' ? ATTRIBUTE : ELEMENT;
}

// ASCII case-insensitive string equality for HTML name matching (§6). Compares
// in place — no lowercased copies are allocated, and a length mismatch (the
// common case when scanning many elements) short-circuits immediately. Non-ASCII
// letters stay case-sensitive.
function asciiEqualsIgnoreCase(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    let ca = a.charCodeAt(i);
    let cb = b.charCodeAt(i);
    if (ca >= 0x41 && ca <= 0x5a) ca += 0x20;
    if (cb >= 0x41 && cb <= 0x5a) cb += 0x20;
    if (ca !== cb) return false;
  }
  return true;
}

// ASCII-only lowercasing, used to build the case-folded key for an HTML
// attribute lookup (§6: HTML attribute keys are lowercase).
function asciiLower(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c >= 0x41 && c <= 0x5a ? String.fromCharCode(c + 0x20) : s[i];
  }
  return out;
}

// Resolves a namespace prefix to a URI, or null if unbound. The `xml` prefix is
// always bound (XML Namespaces). Otherwise the supplied resolver is consulted —
// either a function or an object with lookupNamespaceURI (XPathNSResolver, §4).
export function resolvePrefix(resolver, prefix) {
  if (prefix === 'xml') return XML_NS;
  if (!resolver) return null;
  if (typeof resolver === 'function') return resolver(prefix) ?? null;
  if (typeof resolver.lookupNamespaceURI === 'function') {
    return resolver.lookupNamespaceURI(prefix) ?? null;
  }
  return null;
}

// Whether `node` (reached via `axis`) satisfies `nodeTest`. `html` is true when
// evaluating against an HTML document (§6).
export function matchesNodeTest(node, nodeTest, axis, adapter, resolver, html) {
  const type = adapter.nodeType(node);

  if (nodeTest.kind === 'type') {
    switch (nodeTest.name) {
      case 'node':
        return true;
      case 'text':
        return type === TEXT;
      case 'comment':
        return type === COMMENT;
      case 'processing-instruction':
        if (type !== PROCESSING_INSTRUCTION) return false;
        return nodeTest.literal == null || adapter.nodeName(node) === nodeTest.literal;
      default:
        return false;
    }
  }

  // Name test: the node must be of the axis's principal node type.
  if (axis === 'namespace') return false; // no namespace nodes exist
  const principal = principalType(axis);
  if (type !== principal) return false;

  const local = adapter.localName(node);
  const ns = adapter.namespaceURI(node) ?? null;

  if (nodeTest.prefix == null) {
    if (nodeTest.local === '*') return true; // any node of the principal type

    if (html) {
      // HTML attributes are no-namespace and lowercased: ASCII case-insensitive.
      if (principal === ATTRIBUTE) {
        return ns == null && asciiEqualsIgnoreCase(local, nodeTest.local);
      }
      // HTML elements live in the XHTML namespace and fold ASCII case (§6).
      // Foreign content (SVG/MathML) and no-namespace elements keep the standard
      // case-sensitive, no-namespace XPath rule.
      if (ns === XHTML_NS) return asciiEqualsIgnoreCase(local, nodeTest.local);
      return ns == null && local === nodeTest.local;
    }

    // XML/XHTML: unprefixed = no namespace, case-sensitive (REC §2.3).
    return ns == null && local === nodeTest.local;
  }

  // Prefixed name test: the prefix must resolve, then namespace must match.
  const uri = resolvePrefix(resolver, nodeTest.prefix);
  if (uri == null) {
    throw new XPathTypeError(`unresolved namespace prefix '${nodeTest.prefix}'`);
  }
  if (nodeTest.local === '*') return ns === uri;
  return ns === uri && local === nodeTest.local;
}

// Resolves a `@name` attribute name test to the matching attribute's string
// value, or undefined if absent — via the adapter's getAttribute, without
// enumerating the element's attributes into a node-set. Mirrors the attribute
// rules of matchesNodeTest, including §6 HTML case-folding of unprefixed names.
// `nameTest` must be a concrete name test (a non-`*` local name).
export function attributeValue(node, nameTest, adapter, resolver, html) {
  if (adapter.nodeType(node) !== ELEMENT) return undefined;
  let namespaceURI = null;
  if (nameTest.prefix != null) {
    namespaceURI = resolvePrefix(resolver, nameTest.prefix);
    if (namespaceURI == null) {
      throw new XPathTypeError(`unresolved namespace prefix '${nameTest.prefix}'`);
    }
  }
  const local = html && nameTest.prefix == null ? asciiLower(nameTest.local) : nameTest.local;
  const value = adapter.getAttribute(node, namespaceURI, local);
  return value == null ? undefined : value;
}

// The document (root) node owning `node`, or `node` itself if it is the
// document. Null for a detached node with no owner document.
export function documentNodeOf(node, adapter) {
  return adapter.nodeType(node) === DOCUMENT ? node : adapter.ownerDocument(node);
}

// True when `node` belongs to an HTML document (§6), via the adapter.
export function isHtmlDocument(node, adapter) {
  const doc = documentNodeOf(node, adapter);
  return doc ? !!adapter.isHtmlDocument(doc) : false;
}
