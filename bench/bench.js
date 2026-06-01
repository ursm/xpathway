// Micro-benchmark / profiling harness for xpathway.
//
//   node bench/bench.js                 # timings + scaling report
//   node --prof bench/bench.js          # + V8 tick log (process with --prof-process)
//   node --cpu-prof bench/bench.js      # + .cpuprofile for a flamegraph
//
// Goal: confirm linear scaling on Capybara-shaped queries (§7) and surface CPU
// hot spots.

import { createEvaluator, XPathResult } from '../src/index.js';
import { adapter, doc, element, text, XHTML_NS } from '../test/helpers/dom.js';

const h = (name, attrs = {}, children = []) => element(name, attrs, children, { namespaceURI: XHTML_NS });

// A form with `fields` labelled inputs and a `rows`x5 table — roughly the shape
// of a busy page Capybara drives.
function buildPage(fields, rows) {
  const formChildren = [];
  for (let i = 0; i < fields; i++) {
    formChildren.push(h('label', { for: `f${i}` }, [text(`Field ${i}`)]));
    formChildren.push(h('input', { id: `f${i}`, name: `field${i}`, type: 'text' }));
  }
  for (let i = 0; i < fields; i++) {
    formChildren.push(h('a', { href: `/l${i}`, id: `a${i}` }, [text(`Link ${i}`)]));
  }

  const tableRows = [];
  for (let r = 0; r < rows; r++) {
    const cells = [];
    for (let c = 0; c < 5; c++) cells.push(h('td', { class: `c${c}` }, [text(`r${r}c${c}`)]));
    tableRows.push(h('tr', { id: `row${r}` }, cells));
  }

  return doc(
    h('html', {}, [h('body', {}, [
      h('form', {}, formChildren),
      h('table', {}, [h('tbody', {}, tableRows)]),
    ])]),
    { isHtml: true },
  );
}

const FIELD = '*[self::input | self::textarea | self::select]';
const NOT_BUTTONS = "not(./@type = 'submit' or ./@type = 'image' or ./@type = 'hidden')";

// Queries chosen to stress the paths §7 cares about. {target} is interpolated to
// hit a node near the end of the document (worst case for a left-to-right scan).
function queries(n) {
  const mid = Math.floor(n / 2);
  return [
    ['field by label (//label hoist)',
      `.//${FIELD}[${NOT_BUTTONS}][./@id = //label[normalize-space(string(.)) = 'Field ${mid}']/@for]`],
    ['all fields (union-in-predicate)', `.//${FIELD}[${NOT_BUTTONS}]`],
    ['link by text', `.//a[./@href][normalize-space(string(.)) = 'Link ${mid}']`],
    ['count all elements', 'count(//*)'],
    ['table cell by text', `//tr[td[normalize-space(string(.)) = 'r${mid}c2']]/@id`],
    ['deep descendant attr', '//td[@class = "c2"]/@class'],
  ];
}

function timeit(fn, iterations) {
  // warmup
  for (let i = 0; i < Math.min(20, iterations); i++) fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn();
  const end = process.hrtime.bigint();
  return Number(end - start) / 1e6 / iterations; // ms per call
}

function run(label, size, iterations) {
  const page = buildPage(size, size);
  const ev = createEvaluator(adapter);
  console.log(`\n=== ${label}: ${size} fields/links + ${size} rows, ${iterations} iters/query ===`);
  const results = {};
  for (const [name, expr] of queries(size)) {
    const ms = timeit(() => {
      const r = ev.evaluate(expr, page, null, XPathResult.ANY_TYPE);
      // touch the result so nothing is optimized away
      return r.resultType;
    }, iterations);
    results[name] = ms;
    console.log(`  ${name.padEnd(34)} ${ms.toFixed(3)} ms/call`);
  }
  return results;
}

const small = run('small', 200, 300);
const large = run('large', 400, 300);

console.log('\n=== scaling (2x document) — ~2.0x = linear, >>2 = super-linear ===');
for (const name of Object.keys(small)) {
  const ratio = large[name] / small[name];
  const flag = ratio > 2.6 ? '  <-- super-linear' : '';
  console.log(`  ${name.padEnd(34)} ${ratio.toFixed(2)}x${flag}`);
}
