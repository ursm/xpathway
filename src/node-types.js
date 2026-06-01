// DOM node type codes, as reported by the adapter's nodeType(n) (§5).
export const ELEMENT = 1;
export const ATTRIBUTE = 2;
export const TEXT = 3;
export const PROCESSING_INSTRUCTION = 7;
export const COMMENT = 8;
export const DOCUMENT = 9;

// The XML namespace is implicitly bound to the `xml` prefix everywhere.
export const XML_NS = 'http://www.w3.org/XML/1998/namespace';
