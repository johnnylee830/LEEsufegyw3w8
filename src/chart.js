const esc = x => String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = x => new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0}).format(x);
export function drawChart(host, results) {
  const w=760,h=280,p={l:52,r:16,t:20,b:34},innerW=w-p.l-p.r,innerH=h-p.t-p.b;
  const years=results[0].plan.years;
  const max=Math.max(1,...results.flatMap(r=>r.rows.map(row=>Math.max(row.assets,row.contributed))))*1.12;
  const x=year=>p.l+year/years*innerW,y=value=>p.t+(1-value/max)*innerH;
  const path=rows=>rows.map((row,i)=>`${i?'L':'M'}${x(row.year).toFixed(2)},${y(row.assets).toFixed(2)}`).join(' ');
  const colors=['#2d7959','#c5a160','#a0aba0'];
  const grid=Array.from({length:5},(_,i)=>{const value=max*i/4,yy=y(value);return `<line x1="${p.l}" x2="${w-p.r}" y1="${yy}" y2="${yy}" stroke="#edf0e8"/><text x="${p.l-13}" y="${yy+4}" text-anchor="end" fill="#a4af99" font-size="10" font-family="Arial">${money(value/10000)}</text>`}).join('');
  const ticks=[...new Set([0,Math.round(years/4),Math.round(years/2),Math.round(years*3/4),years])];
  const labels=ticks.map(t=>`<text x="${x(t)}" y="${h-8}" text-anchor="middle" fill="#a4af99" font-size="10" font-family="Arial">${t} 年</text>`).join('');
  const area=path(results[0].rows)+` L${x(years)},${y(0)} L${x(0)},${y(0)} Z`;
  const principal=results[0].rows.map((row,i)=>`${i?'L':'M'}${x(row.year)},${y(row.contributed)}`).join(' ');
  host.innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(years)} 年資產情境比較；詳細數值見下方年度表格"><defs><linearGradient id="growth-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#8ab171" stop-opacity=".20"/><stop offset="100%" stop-color="#8ab171" stop-opacity=".015"/></linearGradient></defs>${grid}${labels}<path d="${area}" fill="url(#growth-fill)"/>${results.map((r,i)=>`<path d="${path(r.rows)}" stroke="${colors[i]}" stroke-width="${i===0?2.8:1.8}" fill="none"/>`).join('')}<path d="${principal}" stroke="#b5c0aa" stroke-width="1.5" stroke-dasharray="5 5" fill="none"/><line id="chart-cursor" x1="0" x2="0" y1="${p.t}" y2="${h-p.b}" stroke="#b5c0aa" stroke-dasharray="3 3" visibility="hidden"/>${results.map((r,i)=>`<circle cx="${x(years)}" cy="${y(r.assets)}" r="3" fill="${colors[i]}"/>`).join('')}</svg><div class="chart-tooltip" hidden></div>`;
  const svg=host.querySelector('svg'),tip=host.querySelector('.chart-tooltip'),cursor=host.querySelector('#chart-cursor');
  host.onpointermove=e=>{
    const box=svg.getBoundingClientRect(),local=(e.clientX-box.left)/box.width*w;
    if(local<p.l||local>w-p.r){tip.hidden=true;cursor.setAttribute('visibility','hidden');return;}
    const year=Math.max(0,Math.min(years,Math.round((local-p.l)/innerW*years)));
    cursor.setAttribute('x1',x(year));cursor.setAttribute('x2',x(year));cursor.setAttribute('visibility','visible');
    tip.innerHTML=`<strong>第 ${year} 年</strong>${results.map((r,i)=>`<p><span>${['股息再投入','股息領現','不含息'][i]}</span><span>${money(r.rows[year].assets)}</span></p>`).join('')}`;
    tip.hidden=false;tip.style.left=Math.min(Math.max(0,e.clientX-box.left+12),Math.max(0,box.width-180))+'px';tip.style.top='20px';
  };
  host.onpointerleave=()=>{tip.hidden=true;cursor.setAttribute('visibility','hidden');};
}
