import { DEFAULTS, validatePlan, simulate, compareModes, goalPlan, createCsv } from './math.mjs';
import { drawChart } from './chart.js';

const $ = selector => document.querySelector(selector);
const money = n => new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 }).format(n);
const price = n => n == null ? '—' : new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const percent = n => n == null ? '—' : `${n.toFixed(2)}%`;
const currency = n => `NT$ ${money(n)}`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = id => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
const modeNames = { reinvest: '股息再投入', cash: '股息領現', exclude: '不含息' };
const modeDescriptions = { reinvest: '讓稅後股息繼續參與投資，觀察複利的累積。', cash: '股息領出並累積為不生息現金，合計資產包含這筆現金。', exclude: '只觀察 ETF 價差，不計入任何股息；用來理解配息的影響。' };
const storageKey = 'tw-etf-planner-v1';
const state = { data: null, funds: [], code: '0050', plan: { ...DEFAULTS }, result: null, compare: [], favorites: [], filter: 'all', savedPlan: null, savedCode: '0050' };
let toastTimer;
const goalError = document.createElement('p');
goalError.id = 'goal-error';
goalError.className = 'form-error';
goalError.setAttribute('role', 'alert');
goalError.hidden = true;
$('#goalMonthly').closest('.input-unit').after(goalError);

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}
function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ plan: state.savedPlan, code: state.savedCode, compare: state.compare, favorites: state.favorites }));
    return true;
  } catch { toast('瀏覽器無法儲存設定，你仍可繼續試算或匯出 CSV。'); return false; }
}
function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!saved) return;
    if (saved.plan) state.savedPlan = state.plan = validatePlan(saved.plan);
    const codes = new Set(state.funds.map(f => f.code));
    state.code = state.savedCode = codes.has(saved.code) ? saved.code : '0050';
    state.compare = Array.isArray(saved.compare) ? [...new Set(saved.compare)].filter(c => codes.has(c)).slice(0, 3) : [];
    state.favorites = Array.isArray(saved.favorites) ? [...new Set(saved.favorites)].filter(c => codes.has(c)) : [];
  } catch { toast('無法讀取舊的儲存設定，已改用預設計畫。'); }
}
function fillInputs(plan) {
  for (const [key, value] of Object.entries(plan)) {
    const input = $(`#${key}`);
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else input.value = value;
  }
  document.querySelectorAll('[name=mode]').forEach(input => input.checked = input.value === plan.mode);
}
function readPlan() {
  const raw = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (key === 'mode') raw.mode = $('[name=mode]:checked').value;
    else if (key === 'liquidate') raw.liquidate = $('#liquidate').checked;
    else {
      const input = $(`#${key}`);
      if (!input || input.value.trim() === '') throw new Error('empty');
      raw[key] = Number(input.value);
    }
  }
  return validatePlan(raw);
}
function updateCalculation() {
  try {
    state.plan = readPlan();
    $('#form-error').hidden = true;
    goalError.hidden = true;
    $('#years-output').value = state.plan.years;
    $('#mode-description').textContent = modeDescriptions[state.plan.mode];
    const results = compareModes(state.plan);
    state.result = results.find(r => r.plan.mode === state.plan.mode);
    const r = state.result;
    $('#result-years').textContent = state.plan.years;
    $('#total-assets').textContent = money(r.assets);
    $('#result-caption').textContent = `${modeNames[state.plan.mode]} · 累積報酬 ${r.roi.toFixed(1)}%（非年化）${state.plan.liquidate ? ' · 已扣估算賣出費稅' : ' · 尚未賣出'} `;
    $('#total-invested').textContent = currency(r.contributed);
    $('#total-profit').textContent = `${r.profit >= 0 ? '+' : '−'}${currency(Math.abs(r.profit))}`;
    $('#total-profit').className = r.profit >= 0 ? 'positive' : 'negative';
    $('#real-assets').textContent = currency(r.realAssets);
    $('#reinvest-difference').textContent = currency(results[0].assets - results[1].assets);
    $('#monthly-income').textContent = currency(r.monthlyIncome);
    $('#monthly-income').previousElementSibling.textContent = '若續抱的每月股息估算';
    $('#monthly-income').nextElementSibling.textContent = '以尚未賣出的期末部位估算，年配息平均至每月。';
    drawChart($('#growth-chart'), results);
    $('#yearly-body').innerHTML = r.rows.map(row => `<tr><td>第 ${row.year} 年</td><td>${money(row.contributed)}</td><td>${money(row.holdings)}</td><td>${money(row.cash)}</td><td>${money(row.assets)}</td><td class="${row.profit >= 0 ? 'positive' : 'negative'}">${row.profit >= 0 ? '+' : '−'}${money(Math.abs(row.profit))}</td></tr>`).join('');
    $('#scenario-cards').innerHTML = [-2, 0, 2].map((delta, i) => {
      const rate = Math.max(-50, Math.min(50, state.plan.priceReturn + delta));
      const scenario = simulate({ ...state.plan, priceReturn: rate });
      return `<div class="scenario"><span>${['較低成長', '目前假設', '較高成長'][i]}</span><strong>${money(scenario.assets / 10000)} 萬</strong><small>股價年成長 ${rate}%</small></div>`;
    }).join('');
    renderGoals();
  } catch {
    $('#form-error').textContent = '請填入有效數字並符合欄位範圍；年期須為 1–50 的整數。以下結果尚未更新。';
    $('#form-error').hidden = false;
    goalError.textContent = '請輸入有效的每月目標（0–10,000,000 元），並確認投資試算欄位皆有效。結果尚未更新。';
    goalError.hidden = false;
  }
}
function renderGoals() {
  const p = state.plan, r = state.result;
  if (!r) return;
  const goal = goalPlan(p);
  $('#goal-assets').textContent = goal.requiredAssets == null ? '需設定大於 0 的配息率' : currency(goal.requiredAssets);
  $('#goal-contribution').textContent = goal.requiredMonthly == null ? '無法在目前範圍內估算' : `${currency(goal.requiredMonthly)} / 月`;
  $('#goal-note').textContent = (goal.requiredMonthly === 0 ? '依目前假設，不必增加月投入即可達到目標；實際結果仍可能不同。' : '沿用目前年期、股息模式、費用與增額投入假設。所需月投入是第一年的金額，不是購買建議。') + '現金流目標以繼續持有 ETF 計算，不套用期末賣出設定。';
  $('#goal-assumptions').innerHTML = `目前計畫：${p.years} 年 · ${modeNames[p.mode]}<br>股價年成長 ${p.priceReturn}% · 年配息率 ${p.dividendYield}%<br>股息有效稅率 ${p.dividendTax}% · 初始投入 ${currency(p.initial)}`;
  const saleRate = p.liquidate ? (p.sellFee + p.sellTax) / 100 : 0;
  const stressed = r.holdings * .7 * (1 - saleRate) + r.cash;
  $('#stress-assets').textContent = currency(stressed);
  $('#stress-loss').textContent = `相較原試算減少 ${currency(r.assets - stressed)}`;
}
function selectedFund() { return state.funds.find(f => f.code === state.code); }
function renderQuickFunds() {
  const picks = ['0050', '00878', '0056'].map(c => state.funds.find(f => f.code === c)).filter(Boolean);
  $('#quick-funds').innerHTML = picks.map(f => `<button class="quick-fund ${f.code === state.code ? 'selected' : ''}" data-pick="${esc(f.code)}"><span class="fund-monogram">${esc(f.name[0])}</span><span><span class="fund-name">${esc(f.name)}</span><span class="fund-code">${f.code} · 台股 ETF</span></span><span class="quick-price"><strong>${price(f.price)}</strong><small>最近收盤 · NT$</small></span></button>`).join('');
}
function pickFund(code, navigate = false) {
  if (!state.funds.some(f => f.code === code)) return;
  state.code = code;
  $('#fund-select').value = code;
  const f = selectedFund();
  const reference = f.trailingYield == null ? '無可用的近一年已發放配息率' : `近一年已發放配息率 ${percent(f.trailingYield)}${f.underOneYear ? '（上市未滿一年，未年化）' : ''}`;
  $('#fund-summary').innerHTML = `收盤 ${price(f.price)} 元 · ${reference}<br>歷史配息僅供查閱，不會自動填入未來假設。<button type="button" data-details="${f.code}">查看配息與資料口徑</button>`;
  renderQuickFunds();
  if (navigate) location.hash = 'overview';
}
function yieldCell(f) {
  return `${percent(f.trailingYield)}${f.underOneYear ? '<span class="tag">未滿一年</span>' : ''}`;
}
function renderFunds() {
  const query = $('#fund-search').value.trim().toLowerCase();
  const funds = state.funds.filter(f => (!query || `${f.code} ${f.name} ${f.index}`.toLowerCase().includes(query)) && (state.filter === 'all' || state.filter === f.category || state.filter === 'saved' && state.favorites.includes(f.code)));
  $('#funds-body').innerHTML = funds.map(f => `<tr><td><button class="star-button" data-star="${f.code}" aria-pressed="${state.favorites.includes(f.code)}" aria-label="${state.favorites.includes(f.code) ? '取消收藏' : '收藏'} ${esc(f.name)}">${icon('star')}</button></td><td><button class="text-button fund-title" data-details="${f.code}"><strong>${f.code}</strong>${esc(f.name)}<small>${esc(f.index || '追蹤指數未提供')}</small></button></td><td>${price(f.price)}</td><td>${yieldCell(f)}</td><td>${f.payoutCount} 次</td><td><button class="mini-button ${state.compare.includes(f.code) ? 'selected' : ''}" data-compare="${f.code}">${state.compare.includes(f.code) ? '已加入' : '＋比較'}</button><button class="mini-button" data-pick="${f.code}">試算</button></td></tr>`).join('');
  $('#empty-funds').hidden = funds.length > 0;
  $('#universe-note').textContent = `共 ${state.funds.length} 檔，符合目前條件 ${funds.length} 檔。${state.data.coverage}「高息相關」依基金簡稱關鍵字分類，非投資建議。`;
}
function renderCompare() {
  $('#compare-count').textContent = state.compare.length;
  if (!state.compare.length) {
    $('#compare-content').innerHTML = '<div class="empty-state"><h2>先挑幾檔想認識的 ETF</h2><p style="margin:12px 0 23px">到探索頁按「＋比較」，就能並排查看資料。</p><a class="button primary" href="#explore">開始探索 ETF</a></div>';
    return;
  }
  $('#compare-content').innerHTML = `<div class="compare-grid">${state.compare.map(code => {
    const f = state.funds.find(f => f.code === code);
    return `<article class="card compare-card"><button class="text-button remove" data-compare="${f.code}" aria-label="移除 ${esc(f.name)}">移除 ×</button><span class="compare-code">${f.code}</span><h2>${esc(f.name)}</h2><dl><div><dt>最近收盤價</dt><dd>${price(f.price)} 元</dd></div><div><dt>近一年配息率*</dt><dd>${yieldCell(f)}</dd></div><div><dt>已發放配息次數</dt><dd>${f.payoutCount} 次</dd></div><div><dt>上市日期</dt><dd>${f.listed || '未提供'}</dd></div><div><dt>追蹤指數</dt><dd>${esc(f.index || '未提供')}</dd></div><div><dt>內扣費用率</dt><dd>請查公開說明書</dd></div></dl><button class="button primary" data-pick="${f.code}">選用這檔 ETF 試算 ${icon('arrow')}</button><button class="button secondary" data-details="${f.code}">查看配息紀錄</button></article>`;
  }).join('')}</div><p class="compare-caveat">* 配息率不是含息總報酬；資料可能尚未涵蓋全部分割或反分割，上市未滿一年者亦不可直接比較。此清單不包含歷史回測、成分股重疊率、折溢價或實際費用率。請搭配官方公開說明書評估。</p>`;
}
function showDetails(code) {
  const f = state.funds.find(f => f.code === code);
  if (!f) return;
  $('#dialog-title').textContent = `${f.code} ${f.name}`;
  $('#dialog-content').innerHTML = `<p class="dialog-index">${esc(f.type)}<br>追蹤指數：${esc(f.index || '未提供')}</p><div class="dialog-details"><div><span>最近收盤（${f.priceDate || '未提供'}）</span>${price(f.price)} 元</div><div><span>近一年已發放配息率</span>${percent(f.trailingYield)}</div><div><span>已發放每單位配息合計</span>${f.trailingDividend.toFixed(4)} 元</div><div><span>已發放次數 / 上市日期</span>${f.payoutCount} 次 / ${f.listed || '未提供'}</div></div><div class="table-scroll"><table><thead><tr><th>除息日</th><th>發放日</th><th>公告每單位金額</th><th>換算現行單位*</th></tr></thead><tbody>${f.payouts.map(d=>`<tr><td>${d.exDate}</td><td>${d.paymentDate}</td><td>${d.amount.toFixed(4)}</td><td>${d.adjustedAmount.toFixed(4)}${d.splitDivisor > 1 ? `（÷${d.splitDivisor}）` : ''}</td></tr>`).join('') || '<tr><td colspan="4">本期間沒有可用的已發放配息紀錄，不能據此判定未來不配息。</td></tr>'}</tbody></table></div><p class="dialog-note">期間：${state.data.windowStart}（不含）至 ${state.data.marketDate}。依發放日篩選，未來公告不列入。${f.underOneYear ? '本基金上市未滿一年，數值未年化。' : ''}<br>* ${esc(state.data.dividendMethod)}<br>配息金額可能含收益平準金或已實現資本利得，並非全部來自股利。歷史配息不會自動套入未來試算。</p><a class="button secondary" href="https://www.twse.com.tw/zh/ETFortune/dividendList" target="_blank" rel="noopener">查閱官方配息資料 ↗</a>`;
  $('#fund-dialog').showModal();
}
function renderSources() {
  $('#source-details').innerHTML = `<p>資料擷取時間：${new Date(state.data.fetchedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}（台北時間）。收盤基準日：${state.data.marketDate}。本網站為資料快照，並非即時報價，週末與休市日不會產生新收盤價。</p><p>${esc(state.data.coverage)}</p><p>${esc(state.data.dividendMethod)}未找到完整的分割歷史 API，因此未保證涵蓋所有企業行動，不宜單靠這個數值排序購買。</p><div class="source-list">${Object.entries(state.data.sources).map(([key,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener">${({ profiles:'證交所 ETF 基本資料',prices:'證交所最新收盤行情',dividends:'證交所 ETF 配息紀錄' })[key]} ↗</a>`).join('')}${state.data.knownSplits.map(s=>`<a href="${esc(s.source)}" target="_blank" rel="noopener">已納入：${s.code} ${s.date} 一拆 ${s.ratio} 官方公告 ↗</a>`).join('')}</div><p>費用率、歷史調整後價格與歷史總報酬尚未接入。沒有資料時會顯示「未提供」，不以模擬數字填補。</p>`;
}
function navigate() {
  const pages = ['overview', 'explore', 'goals', 'compare', 'learn'];
  const target = location.hash.slice(1);
  const page = pages.includes(target) ? target : 'overview';
  document.querySelectorAll('.page-view').forEach(section => section.hidden = section.id !== page);
  document.querySelectorAll('.nav-item').forEach(link => {
    const active = link.hash === '#' + page;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  if (page === 'explore') renderFunds();
  if (page === 'compare') renderCompare();
  if (page === 'goals') renderGoals();
  if (target && target !== 'main') window.scrollTo({ top: 0, behavior: 'instant' });
}
function wire() {
  $('#plan-form').addEventListener('submit', e => e.preventDefault());
  $('#plan-form').addEventListener('input', e => { if (e.target.id !== 'fund-select') updateCalculation(); });
  $('#goalMonthly').addEventListener('input', updateCalculation);
  $('#fund-select').addEventListener('change', e => pickFund(e.target.value));
  $('#fund-search').addEventListener('input', renderFunds);
  document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
    state.filter = b.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(btn => { const active = btn === b; btn.classList.toggle('selected', active); btn.setAttribute('aria-pressed', String(active)); });
    renderFunds();
  }));
  document.addEventListener('click', e => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.dataset.pick) pickFund(button.dataset.pick, !button.classList.contains('quick-fund'));
    if (button.dataset.details) showDetails(button.dataset.details);
    if (button.dataset.star) {
      const code = button.dataset.star;
      state.favorites = state.favorites.includes(code) ? state.favorites.filter(c => c !== code) : [...state.favorites, code];
      persist(); renderFunds();
    }
    if (button.dataset.compare) {
      const code = button.dataset.compare;
      if (state.compare.includes(code)) state.compare = state.compare.filter(c => c !== code);
      else if (state.compare.length < 3) { state.compare.push(code); toast('已加入比較清單，可從左側「我的比較清單」查看。'); }
      else { toast('最多比較 3 檔，請先移除一檔。'); return; }
      persist(); renderFunds(); renderCompare();
    }
  });
  $('#save-plan').addEventListener('click', () => {
    if (!$('#form-error').hidden) return toast('請先修正輸入，再儲存計畫。');
    state.savedPlan = { ...state.plan }; state.savedCode = state.code;
    if (persist()) toast('計畫已儲存在這個瀏覽器，下次開啟會自動帶入。');
  });
  $('#reset-plan').addEventListener('click', () => { state.plan = { ...DEFAULTS }; fillInputs(state.plan); updateCalculation(); toast('已重設試算，已儲存的計畫不受影響。'); });
  $('#export-csv').addEventListener('click', () => {
    if (!state.result || !$('#form-error').hidden) return toast('請先完成有效的試算。');
    const blob = new Blob([createCsv(state.result)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `ETF-${state.code}-${modeNames[state.plan.mode]}-${state.plan.years}年.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#close-dialog').addEventListener('click', () => $('#fund-dialog').close());
  $('#fund-dialog').addEventListener('click', e => { if (e.target === $('#fund-dialog')) { const r=e.target.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close(); } });
  $('#clear-local').addEventListener('click', () => {
    try { localStorage.removeItem(storageKey); } catch { return toast('無法清除瀏覽器儲存空間。'); }
    state.savedPlan = null; state.savedCode = '0050'; state.favorites = []; state.compare = [];
    renderCompare(); renderFunds(); toast('已清除本機儲存的設定；目前畫面上的試算保留。');
  });
  window.addEventListener('hashchange', navigate);
}

async function init() {
  try {
    const response = await fetch('data/etfs.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('data response');
    state.data = await response.json();
    if (!Array.isArray(state.data.funds) || !state.data.funds.length) throw new Error('data schema');
    state.funds = state.data.funds;
    loadSaved();
    $('#fund-select').innerHTML = state.funds.map(f => `<option value="${esc(f.code)}">${f.code} ${esc(f.name)}</option>`).join('');
    $('#market-date').textContent = `收盤資料 ${state.data.marketDate}`;
    fillInputs(state.plan);
    wire(); pickFund(state.code); updateCalculation(); renderFunds(); renderCompare(); renderSources(); navigate();
    const age = (Date.now() - new Date(state.data.marketDate + 'T00:00:00+08:00')) / 86400000;
    if (age > 7) toast(`目前是 ${state.data.marketDate} 的歷史快照，價格與配息可能已變動。`);
  } catch (error) {
    console.error('ETF data initialization failed:', error);
    $('#market-date').textContent = '官方資料暫時無法讀取';
    state.data = { coverage: '官方 ETF 資料暫時無法讀取，請稍後重新整理。', funds: [] };
    $('#fund-select').innerHTML = '<option value="">ETF 資料尚未載入</option>';
    $('#quick-funds').innerHTML = '<div class="error-banner">無法讀取 ETF 資料快照。若以檔案直接開啟，請改用本機伺服器。你仍可使用下方的假設試算。</div>';
    fillInputs(DEFAULTS); wire(); updateCalculation(); navigate();
  }
}
init();
