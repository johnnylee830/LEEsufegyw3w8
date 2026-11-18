import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const sources = {
  profiles: 'https://openapi.twse.com.tw/v1/opendata/t187ap47_L',
  prices: 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
  dividends: 'https://www.twse.com.tw/rwd/zh/ETF/etfDiv?response=json',
};
const knownSplits = [
  { code: '0050', date: '2025-06-18', ratio: 4, source: 'https://www.twse.com.tw/staticFiles/news/news/tsecnews/8a8216d696b406fc0196ce290acb0065.pdf' },
  { code: '0052', date: '2025-11-26', ratio: 7, source: 'https://investoredu.twse.com.tw/Mobile_pages/..%2FFileSystem%2FFileUpload%2F2f4bbb9f-2589-4318-a307-3d22eea8e971.pdf' },
];
const get = async url => {
  const res = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { 'User-Agent': 'Taiwan-ETF-Planner/1.0 (public TWSE data snapshot)' } });
  if (!res.ok) throw new Error(`Official source HTTP ${res.status}: ${url}`);
  return res.json();
};
export function parseRocDate(input) {
  if (!input) return null;
  const s = String(input).trim();
  let m = s.match(/^(\d{2,4})[年/.-](\d{1,2})[月/.-](\d{1,2})日?$/);
  if (!m && /^\d{7,8}$/.test(s)) m = [s, s.slice(0, -4), s.slice(-4, -2), s.slice(-2)];
  if (!m) return null;
  const y = Number(m[1]) < 1911 ? Number(m[1]) + 1911 : Number(m[1]);
  const month = Number(m[2]), day = Number(m[3]);
  const d = new Date(Date.UTC(y, month - 1, day));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}
const numeric = x => {
  if (x == null || String(x).trim() === '') return null;
  const n = Number(String(x).replaceAll(',', ''));
  return Number.isFinite(n) ? n : null;
};

async function main() {
  const [profiles, prices, dividends] = await Promise.all(Object.values(sources).map(get));
  if (!Array.isArray(profiles) || !Array.isArray(prices) || dividends.status !== 'ok' || !Array.isArray(dividends.data)) throw new Error('Official API schema changed; existing snapshot was not overwritten.');
  const marketDate = prices.map(p => parseRocDate(p.Date)).filter(Boolean).sort().at(-1);
  if (!marketDate) throw new Error('Missing official market date');
  const start = new Date(marketDate + 'T00:00:00Z');
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  const windowStart = start.toISOString().slice(0, 10);
  const priceMap = new Map(prices.map(p => [p.Code, p]));
  const allDividends = dividends.data.map(row => ({ code: String(row[0]), exDate: parseRocDate(row[2]), paymentDate: parseRocDate(row[4]), amount: numeric(row[5]) }));
  const eligible = profiles.filter(p => ['國內成分證券指數股票型基金', '國內成分證券主動式交易所交易基金(股票)'].includes(p['基金類型']) && p['是否包含國外成分股'] === '否');
  const funds = eligible.map(p => {
    const code = String(p['基金代號']);
    const price = priceMap.get(code);
    const priceDate = parseRocDate(price?.Date);
    const payouts = allDividends.filter(d => d.code === code && d.paymentDate > windowStart && d.paymentDate <= marketDate && d.exDate && d.exDate <= marketDate && d.amount !== null && d.amount >= 0).map(d => {
      const divisor = knownSplits.filter(s => s.code === code && s.date > d.exDate && s.date <= marketDate).reduce((r, s) => r * s.ratio, 1);
      return { ...d, adjustedAmount: d.amount / divisor, splitDivisor: divisor };
    }).sort((a,b) => b.paymentDate.localeCompare(a.paymentDate));
    const listed = parseRocDate(p['上市日期']);
    const close = numeric(price?.ClosingPrice);
    const trailingDividend = payouts.reduce((sum, d) => sum + d.adjustedAmount, 0);
    const name = p['基金簡稱'] || price?.Name || code;
    return { code, name, fullName: p['基金名稱'] || name, index: p['標的指數/追蹤指數名稱'] || p['標的指數'] || '',
      category: p['基金類型'].includes('主動式') ? 'active' : /高股息|高息|優息|股利|優選|高填息/.test(name) ? 'dividend' : 'market',
      type: p['基金類型'], listed, underOneYear: listed ? listed > windowStart : true,
      price: close && close > 0 ? close : null, priceDate, dailyChange: numeric(price?.Change),
      volume: numeric(price?.TradeVolume), trailingDividend, trailingYield: close && close > 0 && payouts.length ? trailingDividend / close * 100 : null,
      payoutCount: payouts.length, payouts, expenseRatio: null,
      knownSplitsAdjusted: knownSplits.filter(s => s.code === code && s.date <= marketDate),
    };
  }).sort((a,b) => a.code.localeCompare(b.code));
  if (funds.length < 20) throw new Error(`Unexpectedly small ETF universe (${funds.length}); preserving snapshot`);
  const snapshot = { version: 1, fetchedAt: new Date().toISOString(), marketDate, windowStart,
    coverage: '臺灣證券交易所上市、以國內股票為成分且不含國外成分股的原型及主動式 ETF；不含上櫃、債券、槓桿與反向 ETF。',
    dividendMethod: '以發放日落在基準日前12個月且已發放的每單位配息加總，除以最新收盤價；依除息日校正已確認的0050及0052分割，其他分割資料可能不完整。未滿一年不年化。',
    sources, knownSplits, funds };
  const target = new URL('../data/etfs.json', import.meta.url);
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(target, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`Saved ${funds.length} official ETF records. Market date: ${marketDate}. TTM payments: (${windowStart}, ${marketDate}].`);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
