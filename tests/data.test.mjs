import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseRocDate } from '../scripts/update-data.mjs';
const data = JSON.parse(await readFile(new URL('../data/etfs.json', import.meta.url), 'utf8'));

test('ROC and Gregorian dates parse without silently accepting impossible dates', () => {
  assert.equal(parseRocDate('1151117'), '2026-11-17');
  assert.equal(parseRocDate('115年1月2日'), '2026-01-02');
  assert.equal(parseRocDate('2025-06-18'), '2025-06-18');
  assert.equal(parseRocDate('115年02月30日'), null);
  assert.equal(parseRocDate(''), null);
});
test('official snapshot has unique domestic ETF codes and valid prices', () => {
  assert.ok(data.funds.length >= 20);
  assert.equal(new Set(data.funds.map(f => f.code)).size, data.funds.length);
  assert.ok(data.funds.every(f => /^0\d+[A-Z]?$/.test(f.code) && (f.price === null || f.price > 0)));
});
test('dividends exclude future unpaid announcements and sum on consistent unit bases', () => {
  for (const f of data.funds) {
    assert.ok(f.payouts.every(p => p.paymentDate > data.windowStart && p.paymentDate <= data.marketDate && p.exDate <= data.marketDate));
    const total = f.payouts.reduce((n,p)=>n+p.adjustedAmount,0);
    assert.ok(Math.abs(total - f.trailingDividend) < 1e-8);
    if (f.trailingYield !== null) assert.ok(Math.abs(f.trailingYield - total/f.price*100) < 1e-8);
    for (const p of f.payouts) {
      const expected = data.knownSplits.filter(s => s.code === f.code && s.date > p.exDate && s.date <= data.marketDate).reduce((ratio,s)=>ratio*s.ratio,1);
      assert.equal(p.splitDivisor, expected);
      assert.ok(Math.abs(p.adjustedAmount - p.amount/expected) < 1e-8);
    }
  }
});
