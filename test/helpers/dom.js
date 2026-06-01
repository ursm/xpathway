// Minimal in-memory DOM + a §5-conformant adapter, used as the test substrate.
// Nodes are plain objects; the adapter is the only thing the library sees.
//
// This mirrors the shape capybara-simulated exposes (element/text/comment/attr/
// document) but is deliberately tiny. It grows as later stages need more (axes,
// HTML case-folding, namespaces).

export const XHTML_NS = 'http://www.w3.org/1999/xhtml';
export const XML_NS = 'http://www.w3.org/XML/1998/namespace';

const ELEMENT = 1;
const ATTRIBUTE = 2;
const TEXT = 3;
const PROCESSING_INSTRUCTION = 7;
const COMMENT = 8;
const DOCUMENT = 9;

function splitQName(qname) {
  const i = qname.indexOf(':');
  if (i === -1) return { prefix: null, local: qname };
  return { prefix: qname.slice(0, i), local: qname.slice(i + 1) };
}

// --- Builders (parents/ownerDocument/order are wired by doc()) -------------

export function element(name, attrs = {}, children = [], { namespaceURI = null } = {}) {
  const { prefix, local } = splitQName(name);
  const node = {
    nodeType: ELEMENT,
    name,
    localName: local,
    prefix,
    namespaceURI,
    attributes: [],
    childNodes: [],
    parent: null,
    ownerDocument: null,
  };
  for (const [attrName, value] of Object.entries(attrs)) {
    const a = splitQName(attrName);
    node.attributes.push({
      nodeType: ATTRIBUTE,
      name: attrName,
      localName: a.local,
      prefix: a.prefix,
      // The `xml` prefix is implicitly the XML namespace (needed for lang()).
      // Other prefixed attributes remain no-namespace for these fixtures.
      namespaceURI: a.prefix === 'xml' ? XML_NS : null,
      value: String(value),
      parent: node,
      ownerDocument: null,
    });
  }
  node.childNodes = children;
  return node;
}

export function text(data) {
  return { nodeType: TEXT, value: String(data), childNodes: [], parent: null, ownerDocument: null };
}

export function comment(data) {
  return { nodeType: COMMENT, value: String(data), childNodes: [], parent: null, ownerDocument: null };
}

export function pi(target, data = '') {
  return {
    nodeType: PROCESSING_INSTRUCTION,
    name: target,
    localName: target,
    prefix: null,
    namespaceURI: null,
    value: String(data),
    childNodes: [],
    parent: null,
    ownerDocument: null,
  };
}

// Assembles top-level node(s) into a document, wiring parent pointers,
// ownerDocument, and a pre-order document-order index.
export function doc(topLevel, { isHtml = false } = {}) {
  const children = Array.isArray(topLevel) ? topLevel : [topLevel];
  const document = {
    nodeType: DOCUMENT,
    childNodes: children,
    parent: null,
    ownerDocument: null,
    documentElement: children.find((n) => n.nodeType === ELEMENT) ?? null,
    isHtml,
  };

  // Iterative pre-order walk so deeply nested fixtures (used to test the
  // library's stack-safety) do not overflow the builder itself.
  let order = 0;
  document._order = order++;
  const stack = [];
  for (let i = children.length - 1; i >= 0; i--) stack.push([children[i], document]);
  while (stack.length) {
    const [node, parent] = stack.pop();
    node.parent = parent;
    node.ownerDocument = document;
    node._order = order++;
    if (node.attributes) {
      // Attribute nodes follow their element, before its children (REC §5).
      for (const attr of node.attributes) {
        attr.parent = node;
        attr.ownerDocument = document;
        attr._order = order++;
      }
    }
    const kids = node.childNodes ?? [];
    for (let i = kids.length - 1; i >= 0; i--) stack.push([kids[i], node]);
  }
  return document;
}

// --- string-value (REC §5 / §3.6) ------------------------------------------

function stringValue(node) {
  switch (node.nodeType) {
    case TEXT:
    case COMMENT:
    case ATTRIBUTE:
    case PROCESSING_INSTRUCTION:
      return node.value;
    case ELEMENT:
    case DOCUMENT: {
      // Concatenate all descendant text nodes in document order (iteratively).
      let out = '';
      const stack = [...(node.childNodes ?? [])].reverse();
      while (stack.length) {
        const n = stack.pop();
        if (n.nodeType === TEXT) out += n.value;
        else if (n.nodeType === ELEMENT) {
          const kids = n.childNodes ?? [];
          for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
        }
      }
      return out;
    }
    default:
      return '';
  }
}

// --- The adapter (§5) ------------------------------------------------------

export const adapter = {
  nodeType: (n) => n.nodeType,
  parent: (n) => n.parent ?? null,
  childNodes: (n) => n.childNodes ?? [],
  firstChild: (n) => (n.childNodes && n.childNodes[0]) ?? null,
  nextSibling: (n) => {
    const siblings = n.parent?.childNodes;
    if (!siblings) return null;
    const i = siblings.indexOf(n);
    return i >= 0 && i + 1 < siblings.length ? siblings[i + 1] : null;
  },
  documentElement: (d) => d.documentElement ?? null,
  ownerDocument: (n) => n.ownerDocument ?? null,
  localName: (n) => n.localName ?? null,
  namespaceURI: (n) => n.namespaceURI ?? null,
  prefix: (n) => n.prefix ?? null,
  nodeName: (n) => n.name ?? null,
  attributes: (el) => el.attributes ?? [],
  getAttribute: (el, namespaceURI, localName) => {
    const attr = (el.attributes ?? []).find(
      (a) => a.localName === localName && (a.namespaceURI ?? null) === (namespaceURI ?? null),
    );
    return attr ? attr.value : null;
  },
  stringValue,
  compareDocumentPosition: (a, b) => {
    // Guard against comparing nodes that were never wired into a document:
    // falling back to 0 (or NaN) would silently corrupt document order in tests.
    if (a._order === undefined || b._order === undefined) {
      throw new Error('compareDocumentPosition: node is not attached to a document (build it with doc())');
    }
    return Math.sign(a._order - b._order);
  },
  getElementById: (d, id) => {
    const stack = [...(d.childNodes ?? [])].reverse();
    while (stack.length) {
      const n = stack.pop();
      if (n.nodeType === ELEMENT) {
        const idAttr = (n.attributes ?? []).find((a) => a.localName === 'id' && a.prefix === null);
        if (idAttr && idAttr.value === id) return n;
        const kids = n.childNodes ?? [];
        for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
      }
    }
    return null;
  },
  isHtmlDocument: (d) => !!d.isHtml,
};
