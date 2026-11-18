// Forward scenarios, not historical backtests. Price return is AFTER distributions.
export const DEFAULTS = Object.freeze({
  initial: 100000, monthly: 10000, years: 20, priceReturn: 4, dividendYield: 3,
  mode: 'reinvest', inflation: 2, contributionGrowth: 0,
  buyFee: 0, sellFee: 0, sellTax: 0, dividendTax: 0, liquidate: false,
  goalMonthly: 20000,
});

export function validatePlan(values) {
  const p = { ...DEFAULTS, ...values };
  const ranges = {
    initial: [0, 1e9], monthly: [0, 1e7], years: [1, 50], priceReturn: [-50, 50],
    dividendYield: [0, 30], inflation: [0, 20], contributionGrowth: [0, 20],
    buyFee: [0, 5], sellFee: [0, 5], sellTax: [0, 5], dividendTax: [0, 50], goalMonthly: [0, 1e7],
  };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    p[key] = Number(p[key]);
    if (!Number.isFinite(p[key]) || p[key] < min || p[key] > max) throw new RangeError(`Invalid ${key}`);
  }
  if (!Number.isInteger(p.years)) throw new RangeError('Years must be whole numbers');
  if (!['reinvest', 'cash', 'exclude'].includes(p.mode)) throw new RangeError('Invalid dividend mode');
  p.liquidate = Boolean(p.liquidate);
  return p;
}

export function simulate(values) {
  const p = validatePlan(values);
  const buyFee = p.buyFee / 100;
  const monthlyGrowth = (1 + p.priceReturn / 100) ** (1 / 12);
  const saleRate = p.liquidate ? (p.sellFee + p.sellTax) / 100 : 0;
  let holdings = p.initial / (1 + buyFee);
  let contributed = p.initial;
  let cash = 0;
  let dividends = 0;
  let costs = p.initial - holdings;
  const snapshot = (year) => {
    const saleCost = holdings * saleRate;
    const assets = holdings - saleCost + cash;
    return { year, contributed, holdings, cash, dividends, assets, profit: assets - contributed,
      realAssets: assets / (1 + p.inflation / 100) ** year, costs: costs + saleCost };
  };
  const rows = [snapshot(0)];
  for (let month = 1; month <= p.years * 12; month++) {
    holdings *= monthlyGrowth;
    if (p.mode !== 'exclude') {
      const gross = holdings * p.dividendYield / 100 / 12;
      const tax = gross * p.dividendTax / 100;
      const net = gross - tax;
      dividends += net;
      costs += tax;
      if (p.mode === 'reinvest') {
        const purchase = net / (1 + buyFee);
        holdings += purchase;
        costs += net - purchase;
      } else cash += net;
    }
    const addition = p.monthly * (1 + p.contributionGrowth / 100) ** Math.floor((month - 1) / 12);
    const purchase = addition / (1 + buyFee);
    holdings += purchase;
    costs += addition - purchase;
    contributed += addition;
    if (month % 12 === 0) rows.push(snapshot(month / 12));
  }
  const end = rows.at(-1);
  return { ...end, rows, plan: p, roi: contributed > 0 ? end.profit / contributed * 100 : 0,
    monthlyIncome: holdings * p.dividendYield / 100 * (1 - p.dividendTax / 100) / 12 };
}

export function compareModes(plan) {
  return ['reinvest', 'cash', 'exclude'].map(mode => simulate({ ...plan, mode }));
}

export function goalPlan(plan) {
  const p = validatePlan(plan);
  if (p.goalMonthly === 0) return { requiredAssets: 0, requiredMonthly: 0 };
  const netYield = p.dividendYield / 100 * (1 - p.dividendTax / 100);
  if (netYield <= 0) return { requiredAssets: null, requiredMonthly: null };
  const requiredAssets = p.goalMonthly * 12 / netYield;
  if (simulate({ ...p, monthly: 0 }).holdings >= requiredAssets) return { requiredAssets, requiredMonthly: 0 };
  let lo = 0, hi = 1e7;
  if (simulate({ ...p, monthly: hi }).holdings < requiredAssets) return { requiredAssets, requiredMonthly: null };
  for (let i = 0; i < 55; i++) {
    const mid = (lo + hi) / 2;
    if (simulate({ ...p, monthly: mid }).holdings >= requiredAssets) hi = mid;
    else lo = mid;
  }
  return { requiredAssets, requiredMonthly: Math.ceil(hi) };
}

export function createCsv(result, fundName = '') {
  const q = value => `"${String(value).replaceAll('"', '""')}"`;
  const header = ['年度', '累計投入', 'ETF市值', '累計領現股息', '累計稅後配息', '合計資產', '損益', '今日購買力', '估算費用與股息稅'];
  const fields = ['year', 'contributed', 'holdings', 'cash', 'dividends', 'assets', 'profit', 'realAssets', 'costs'];
  const data = result.rows.map(row => fields.map(key => Number(row[key].toFixed(2))));
  // No user-supplied text is placed in spreadsheet cells that could execute a formula.
  return '\uFEFF' + [header, ...data].map(row => row.map(q).join(',')).join('\r\n');
}
