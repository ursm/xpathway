// Minimal in-memory DOM + a §5-conformant adapter, used as the test substrate.
// Nodes are plain objects; the adapter is the only thing the library sees.
//
// This mirrors the shape capybara-simulated exposes (element/text/comment/attr/
// document) but is deliberately tiny. It grows as later stages need more (axes,
// HTML case-folding, namespaces).

export const XHTML_NS = 'http://www.w3.org/1999/xhtml';

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
      namespaceURI: null,
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

  let order = 0;
  const visit = (node, parent) => {
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
    for (const child of node.childNodes ?? []) visit(child, node);
  };

  document._order = order++;
  for (const child of children) visit(child, document);
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
      let out = '';
      const walk = (n) => {
        for (const child of n.childNodes ?? []) {
          if (child.nodeType === TEXT) out += child.value;
          else if (child.nodeType === ELEMENT) walk(child);
        }
      };
      walk(node);
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
  compareDocumentPosition: (a, b) => Math.sign((a._order ?? 0) - (b._order ?? 0)),
  getElementById: (d, id) => {
    let found = null;
    const walk = (n) => {
      if (found) return;
      if (n.nodeType === ELEMENT) {
        const idAttr = (n.attributes ?? []).find((a) => a.localName === 'id' && a.prefix === null);
        if (idAttr && idAttr.value === id) {
          found = n;
          return;
        }
      }
      for (const child of n.childNodes ?? []) walk(child);
    };
    walk(d);
    return found;
  },
  isHtmlDocument: (d) => !!d.isHtml,
};
