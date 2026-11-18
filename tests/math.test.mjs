import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, compareModes, goalPlan, createCsv } from '../src/math.mjs';
const close = (actual, expected, tolerance = 0.001) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('zero return preserves all principal, with month-end contributions', () => {
  const r = simulate({ initial: 100000, monthly: 10000, years: 10, priceReturn: 0, dividendYield: 0 });
  close(r.assets, 1300000);
  close(r.profit, 0);
  assert.equal(r.rows.length, 11);
});
test('annual price rate compounds exactly over twelve months', () => {
  const r = simulate({ initial: 100000, monthly: 0, years: 5, priceReturn: 5, dividendYield: 0 });
  close(r.assets, 100000 * 1.05 ** 5);
});
test('cash distributions are included once, reinvestment compounds them, exclude ignores them', () => {
  const [reinvest, cash, exclude] = compareModes({ initial: 100000, monthly: 0, years: 1, priceReturn: 0, dividendYield: 12 });
  close(exclude.assets, 100000);
  close(cash.cash, 12000);
  close(cash.assets, 112000);
  close(reinvest.assets, 100000 * 1.01 ** 12);
  assert.equal(reinvest.cash, 0);
});
test('purchase and liquidation costs apply to correct cash bases', () => {
  const r = simulate({ initial: 101000, monthly: 0, years: 1, priceReturn: 0, dividendYield: 0, buyFee: 1, liquidate: true, sellFee: 1, sellTax: 1 });
  close(r.holdings, 100000);
  close(r.assets, 98000);
  close(r.costs, 3000);
});
test('effective dividend tax applies to cash distributions and inflation discounts terminal wealth', () => {
  const r = simulate({ initial: 100000, monthly: 0, years: 1, priceReturn: 0, dividendYield: 12, mode: 'cash', dividendTax: 20, inflation: 2 });
  close(r.cash, 9600);
  close(r.realAssets, 109600 / 1.02);
});
test('negative price scenarios remain finite and can produce losses', () => {
  const r = simulate({ initial: 100000, monthly: 0, years: 20, priceReturn: -20, dividendYield: 0 });
  assert.ok(r.assets >= 0 && r.profit < 0);
});
test('goal search meets target with solved month-end contributions', () => {
  const p = { initial: 0, monthly: 0, years: 20, priceReturn: 4, dividendYield: 3, goalMonthly: 20000 };
  const goal = goalPlan(p);
  close(goal.requiredAssets, 8000000);
  const r = simulate({ ...p, monthly: goal.requiredMonthly });
  assert.ok(r.holdings >= goal.requiredAssets);
  assert.equal(goalPlan({ ...p, dividendYield: 0 }).requiredMonthly, null);
  assert.deepEqual(goalPlan({ ...p, goalMonthly: 0, dividendYield: 0 }), { requiredAssets: 0, requiredMonthly: 0 });
});
test('invalid assumptions fail rather than returning misleading NaNs', () => {
  for (const p of [{ years: 0 }, { years: 1.5 }, { priceReturn: NaN }, { monthly: -1 }, { mode: 'other' }]) assert.throws(() => simulate(p));
});
test('CSV contains yearly rows and UTF-8 BOM', () => {
  const csv = createCsv(simulate({ years: 2 }));
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal(csv.split('\r\n').length, 4);
});
