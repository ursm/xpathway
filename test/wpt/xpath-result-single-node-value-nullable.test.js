import test from 'node:test';

import {
  wptDocument, XPathResult, assert_equals, assert_not_equals,
} from './harness.js';
import { doc, element, XHTML_NS } from '../helpers/dom.js';

// Vendored from web-platform-tests (3-Clause BSD):
//   dom/xpath-result-single-node-value-nullable.html
//   https://github.com/web-platform-tests/wpt/blob/master/dom/xpath-result-single-node-value-nullable.html
//
// The HTML fixture (`<div id="div"><span id="exist"></span></div>`) is rebuilt
// with the reference adapter's DOM; the assertions below are the WPT test body
// run against xpathway's document.evaluate.
//
// NOTE: WPT's XPath coverage is essentially this single case — the primary
// conformance bar for this library is test/conformance/.

const h = (name, attrs = {}, children = []) => element(name, attrs, children, { namespaceURI: XHTML_NS });

function fixture() {
  const span = h('span', { id: 'exist' });
  const div = h('div', { id: 'div' }, [span]);
  return doc(h('html', {}, [h('body', {}, [div])]), { isHtml: true });
}

test('[wpt] singleNodeValue should be nullable', () => {
  const document = wptDocument(fixture());
  const div = document.getElementById('div');

  const isNull = document.evaluate(
    '//non-span',
    div,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null,
  );
  assert_equals(isNull.singleNodeValue, null);

  const isNotNull = document.evaluate(
    '//span',
    div,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null,
  );
  assert_not_equals(isNotNull.singleNodeValue, null);
});
