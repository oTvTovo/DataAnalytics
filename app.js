'use strict';
/* =====================================================================
   資料分析工具 app.js
   結構：1.工具函式 2.欄位判斷 3.讀檔 4.篩選器 5.統計分析 6.視覺化分析 7.事件
   ===================================================================== */

/* ---------- 1. 工具函式 ---------- */
const $ = (s, r = document) => r.querySelector(s);
const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cut = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const isEmpty = v => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const PAL = ['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6'];
const typeLabel = {numeric:'數值', categorical:'類別', date:'日期', text:'文字'};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function toNum(v){
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const s = v.trim().replace(/,/g, '');
  if (s === '') return NaN;
  return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s) ? Number(s) : NaN;
}
function toDate(v){
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!/^\d{4}[-\/.]\d{1,2}([-\/.]\d{1,2})?|^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/.test(s)) return null;
  const d = new Date(s.replace(/\./g, '-').replace(/\//g, '-'));
  return isNaN(d) ? null : d;
}
const dstr = d => d.toISOString().slice(0, 10);
const catKey = v => isEmpty(v) ? '(空白)' : (v instanceof Date ? dstr(v) : String(v).trim());
function fmt(x, d = 4){
  if (x === null || x === undefined || !isFinite(x)) return '-';
  if (x !== 0 && (Math.abs(x) >= 1e9 || Math.abs(x) < 1e-4)) return x.toExponential(3);
  return Number(x).toLocaleString('en', {maximumFractionDigits: d});
}
const pct = x => (x * 100).toFixed(1) + '%';
function quantile(s, p){
  if (!s.length) return NaN;
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
function table(headers, rows, cls = ''){
  return `<div class="tw"><table class="${cls}"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function rng(seed){ let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function sample(arr, m){ if (arr.length <= m) return arr; const st = arr.length / m; return Array.from({length: m}, (_, i) => arr[Math.floor(i * st)]); }

function numStats(vec){
  const a = vec.filter(x => !isNaN(x)).sort((x, y) => x - y);
  const n = a.length;
  if (!n) return null;
  const sum = a.reduce((s, x) => s + x, 0), mean = sum / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of a){ const d = x - mean; m2 += d*d; m3 += d**3; m4 += d**4; }
  const variance = n > 1 ? m2 / (n - 1) : NaN, std = Math.sqrt(variance);
  m2 /= n; m3 /= n; m4 /= n;
  const skew = m2 > 0 ? m3 / Math.pow(m2, 1.5) : NaN;
  const kurt = m2 > 0 ? m4 / (m2*m2) - 3 : NaN;
  const jb = n / 6 * (skew**2 + kurt**2 / 4), jbp = isFinite(jb) ? Math.exp(-jb / 2) : NaN;
  const q1 = quantile(a, .25), med = quantile(a, .5), q3 = quantile(a, .75), iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const out = a.filter(x => x < lo || x > hi);
  const wl = a.find(x => x >= lo), wh = [...a].reverse().find(x => x <= hi);
  return {a, n, sum, mean, std, var: variance, min: a[0], q1, med, q3, max: a[n-1], iqr, skew, kurt, jb, jbp,
          cv: mean !== 0 ? std / Math.abs(mean) : NaN, lo, hi, out, wl, wh};
}
function pearson(x, y){
  let n = 0, sx = 0, sy = 0;
  for (let t = 0; t < x.length; t++) if (!isNaN(x[t]) && !isNaN(y[t])){ n++; sx += x[t]; sy += y[t]; }
  if (n < 3) return NaN;
  const mx = sx / n, my = sy / n; let sxy = 0, sxx = 0, syy = 0;
  for (let t = 0; t < x.length; t++) if (!isNaN(x[t]) && !isNaN(y[t])){
    const dx = x[t] - mx, dy = y[t] - my; sxy += dx*dy; sxx += dx*dx; syy += dy*dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}
function corrMatrix(nc){
  const k = nc.length, M = Array.from({length: k}, () => Array(k).fill(NaN));
  for (let i = 0; i < k; i++) for (let j = i; j < k; j++) M[i][j] = M[j][i] = i === j ? 1 : pearson(nc[i].vec, nc[j].vec);
  return M;
}
function ols(pts){
  const n = pts.length; let sx = 0, sy = 0;
  pts.forEach(p => { sx += p.x; sy += p.y; });
  const mx = sx / n, my = sy / n; let sxy = 0, sxx = 0, syy = 0;
  pts.forEach(p => { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; });
  const b = sxx > 0 ? sxy / sxx : 0, a = my - b * mx;
  return {a, b, r2: sxx > 0 && syy > 0 ? sxy * sxy / (sxx * syy) : 0};
}
function qnorm(p){
  const a = [-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00];
  const b = [-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01];
  const c = [-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00];
  const d = [7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00];
  const pl = 0.02425; let q, r;
  if (p < pl){ q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p > 1 - pl){ q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  q = p - .5; r = q * q;
  return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) * q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}
function kde(sorted, grid){
  const s = sample(sorted, 2000), m = s.length;
  const mean = s.reduce((x, y) => x + y, 0) / m;
  const std = Math.sqrt(s.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, m - 1));
  const iqr = quantile(s, .75) - quantile(s, .25);
  let h = .9 * Math.min(std, iqr > 0 ? iqr / 1.34 : std) * Math.pow(m, -.2);
  if (!(h > 0)) h = (s[m - 1] - s[0]) / 10 || 1;
  const k = 1 / (m * h * Math.sqrt(2 * Math.PI));
  return grid.map(x => { let t = 0; for (let i = 0; i < m; i++){ const z = (x - s[i]) / h; t += Math.exp(-.5 * z * z); } return t * k; });
}
function niceTicks(lo, hi, n = 5){
  if (!isFinite(lo) || !isFinite(hi)) return [0, 1];
  if (lo === hi){ lo -= 1; hi += 1; }
  const step0 = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(step0))), r = step0 / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag, t = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) t.push(+v.toPrecision(12));
  return t;
}
function acf(x, maxLag){
  const n = x.length, m = x.reduce((a, b) => a + b, 0) / n, d = x.map(v => v - m);
  const c0 = d.reduce((s, v) => s + v * v, 0) || 1;
  return Array.from({length: maxLag}, (_, k) => { let s = 0; for (let t = 0; t + k + 1 < n; t++) s += d[t] * d[t + k + 1]; return s / c0; });
}
function pacf(r, maxLag){
  const out = []; let prev = [];
  for (let k = 1; k <= maxLag; k++){
    let num = r[k - 1], den = 1;
    for (let j = 1; j < k; j++){ num -= prev[j - 1] * r[k - j - 1]; den -= prev[j - 1] * r[j - 1]; }
    const pk = den !== 0 ? num / den : 0, cur = [];
    for (let j = 1; j < k; j++) cur.push(prev[j - 1] - pk * prev[k - j - 1]);
    cur.push(pk); prev = cur; out.push(pk);
  }
  return out;
}
function eigSym(M){
  const n = M.length, A = M.map(r => r.slice());
  const V = Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => i === j ? 1 : 0));
  for (let it = 0; it < 200; it++){
    let p = 0, q = 1, mx = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.abs(A[i][j]) > mx){ mx = Math.abs(A[i][j]); p = i; q = j; }
    if (mx < 1e-10) break;
    const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
    const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
    for (let k = 0; k < n; k++){ const a = A[k][p], b = A[k][q]; A[k][p] = c*a - s*b; A[k][q] = s*a + c*b; }
    for (let k = 0; k < n; k++){ const a = A[p][k], b = A[q][k]; A[p][k] = c*a - s*b; A[q][k] = s*a + c*b; }
    for (let k = 0; k < n; k++){ const a = V[k][p], b = V[k][q]; V[k][p] = c*a - s*b; V[k][q] = s*a + c*b; }
  }
  return {vals: A.map((r, i) => r[i]), V};
}
const dist2 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return s; };
function kmeans(Z, k, rand){
  const n = Z.length, d = Z[0].length, cent = [Z[Math.floor(rand() * n)].slice()];
  while (cent.length < k){
    const D = Z.map(z => Math.min(...cent.map(c => dist2(z, c)))), tot = D.reduce((a, b) => a + b, 0);
    let r = rand() * tot, i = 0; while (i < n - 1 && (r -= D[i]) > 0) i++;
    cent.push(Z[i].slice());
  }
  const lab = new Array(n).fill(-1);
  for (let it = 0; it < 50; it++){
    let ch = false;
    for (let i = 0; i < n; i++){
      let b = 0, bd = Infinity;
      for (let c = 0; c < k; c++){ const dd = dist2(Z[i], cent[c]); if (dd < bd){ bd = dd; b = c; } }
      if (lab[i] !== b){ lab[i] = b; ch = true; }
    }
    if (!ch) break;
    const sums = Array.from({length: k}, () => new Array(d).fill(0)), cnt = new Array(k).fill(0);
    for (let i = 0; i < n; i++){ cnt[lab[i]]++; for (let j = 0; j < d; j++) sums[lab[i]][j] += Z[i][j]; }
    for (let c = 0; c < k; c++) if (cnt[c]) cent[c] = sums[c].map(v => v / cnt[c]);
  }
  return {lab, cent};
}
function silhouette(Z, lab, k){
  const n = Z.length; let tot = 0;
  for (let i = 0; i < n; i++){
    const sum = new Array(k).fill(0), cnt = new Array(k).fill(0);
    for (let j = 0; j < n; j++){ if (i === j) continue; sum[lab[j]] += Math.sqrt(dist2(Z[i], Z[j])); cnt[lab[j]]++; }
    const a = cnt[lab[i]] ? sum[lab[i]] / cnt[lab[i]] : 0;
    let b = Infinity;
    for (let c = 0; c < k; c++) if (c !== lab[i] && cnt[c]) b = Math.min(b, sum[c] / cnt[c]);
    tot += isFinite(b) && Math.max(a, b) > 0 ? (b - a) / Math.max(a, b) : 0;
  }
  return tot / n;
}

/* ---------- 全域狀態 ---------- */
let RAW = [], META = [], ROWS = [], COLS = [], SEL = new Set(), FILT = {};
let charts = [], WB = null, fileName = '資料', curTab = 'upload', statsDone = false, vizDone = false;

/* ---------- 2. 欄位自動判斷 ---------- */
function detectMeta(){
  const keySet = new Set();
  RAW.slice(0, 200).forEach(r => Object.keys(r).forEach(k => keySet.add(k)));
  META = [...keySet].filter(k => k !== '__parsed_extra').map((k, idx) => {
    const raw = RAW.map(r => r[k]), ne = raw.filter(v => !isEmpty(v)), n = ne.length;
    const nums = ne.filter(v => !isNaN(toNum(v))).length, dates = ne.filter(v => toDate(v)).length;
    const uniq = new Set(ne.map(catKey));
    let type;
    if (n && nums / n >= .9) type = 'numeric';
    else if (n && dates / n >= .9) type = 'date';
    else if (uniq.size <= Math.max(30, n * .05) || uniq.size <= 50) type = 'categorical';
    else type = 'text';
    const m = {idx, name: k, type};
    if (type === 'categorical'){
      const f = new Map(); raw.forEach(v => { const s = catKey(v); f.set(s, (f.get(s) || 0) + 1); });
      m.options = [...f.entries()].sort((a, b) => b[1] - a[1]);
    }
    if (type === 'numeric'){ const v = ne.map(toNum).filter(x => !isNaN(x)); m.min = Math.min(...v); m.max = Math.max(...v); }
    if (type === 'date'){ const v = ne.map(toDate).filter(Boolean).map(d => d.getTime()); m.dmin = new Date(Math.min(...v)); m.dmax = new Date(Math.max(...v)); }
    return m;
  });
}
function buildCols(){
  COLS = META.filter(m => SEL.has(m.name)).map(m => {
    const raw = ROWS.map(r => r[m.name]), ne = raw.filter(v => !isEmpty(v));
    const c = {name: m.name, type: m.type, raw, n: ne.length, missing: raw.length - ne.length, unique: new Set(ne.map(catKey)).size};
    if (m.type === 'numeric'){ c.vec = raw.map(toNum); c.st = numStats(c.vec); }
    if (m.type === 'date'){ c.dvec = raw.map(toDate); }
    if (m.type === 'categorical'){
      const f = new Map(); ne.forEach(v => { const s = catKey(v); f.set(s, (f.get(s) || 0) + 1); });
      c.freq = [...f.entries()].sort((a, b) => b[1] - a[1]);
      c.keys = raw.map(v => isEmpty(v) ? null : catKey(v));
    }
    return c;
  });
}

/* ---------- 3. 讀檔 ---------- */
function decodeText(buf){
  try { return new TextDecoder('utf-8', {fatal: true}).decode(buf); }
  catch (e){ try { return new TextDecoder('big5').decode(buf); } catch (e2){ return new TextDecoder('utf-8').decode(buf); } }
}
async function handleFile(f){
  if (!f) return;
  fileName = f.name.replace(/\.[^.]+$/, ''); $('#fname').textContent = '已選擇：' + f.name;
  const buf = await f.arrayBuffer();
  try {
    if (/\.(xlsx|xls)$/i.test(f.name)){
      WB = XLSX.read(buf, {cellDates: true});
      $('#sheet').innerHTML = WB.SheetNames.map(n => `<option>${esc(n)}</option>`).join('');
      $('#sheetWrap').style.display = WB.SheetNames.length > 1 ? '' : 'none';
      loadSheet();
    } else {
      WB = null; $('#sheetWrap').style.display = 'none';
      const text = decodeText(buf).replace(/^﻿/, '');
      setData(Papa.parse(text, {header: true, skipEmptyLines: 'greedy', dynamicTyping: false}).data);
    }
  } catch (e){ alert('檔案讀取失敗：' + e.message); }
}
function loadSheet(){ setData(XLSX.utils.sheet_to_json(WB.Sheets[$('#sheet').value], {defval: null, raw: true})); }
function setData(rows){
  rows = rows.filter(r => Object.values(r).some(v => !isEmpty(v)));
  if (!rows.length){ alert('沒有讀到任何資料\n確認一下第一列是不是欄位名稱'); return; }
  RAW = rows; detectMeta();
  SEL = new Set(META.map(m => m.name)); FILT = {};
  buildFilterUI(); applyFilters(false);
  $('#tab-stats').disabled = $('#tab-viz').disabled = false;
  renderPreview();
}
function renderPreview(){
  const cols = META.map(m => m.name);
  const dup = RAW.length - new Set(RAW.map(r => JSON.stringify(r))).size;
  $('#preview').innerHTML = `<div class="card"><h3>資料預覽（前 10 列）</h3>
    <p class="note">共 ${RAW.length.toLocaleString()} 列、${cols.length} 欄、重複列 ${dup} 列<br>系統判斷的欄位型態：${
      META.map(m => `${esc(m.name)}<span class="tag">${typeLabel[m.type]}</span>`).join('　')}</p>
    <p class="note">點上方「統計分析」或「視覺化分析」看完整結果<br>想只看部分資料 可以用篩選器</p>
    ${table(cols.map(esc), RAW.slice(0, 10).map(r => cols.map(c => esc(r[c] instanceof Date ? dstr(r[c]) : (r[c] ?? '')))))}</div>`;
}

/* ---------- 4. 篩選器 ---------- */
function buildFilterUI(){
  $('#varList').innerHTML = META.map(m =>
    `<label class="chip"><input type="checkbox" data-v="${m.idx}" checked>${esc(m.name)} <small>${typeLabel[m.type]}</small></label>`).join('');
  $('#filterGrid').innerHTML = META.filter(m => m.type !== 'text').map(m => {
    let body;
    if (m.type === 'categorical'){
      body = `<div class="opts">${m.options.map(([k, c], i) =>
        `<label><input type="checkbox" data-o="${i}" checked> ${esc(cut(k, 24))} <small>(${c})</small></label>`).join('')}</div>`;
    } else if (m.type === 'numeric'){
      body = `<div class="rng"><input type="number" step="any" data-min placeholder="${fmt(m.min, 2)}"> ~ <input type="number" step="any" data-max placeholder="${fmt(m.max, 2)}"></div>
              <div class="hintline">資料範圍 ${fmt(m.min, 2)} ~ ${fmt(m.max, 2)}</div>`;
    } else {
      body = `<div class="rng"><input type="date" data-from min="${dstr(m.dmin)}" max="${dstr(m.dmax)}"> ~ <input type="date" data-to min="${dstr(m.dmin)}" max="${dstr(m.dmax)}"></div>
              <div class="hintline">資料範圍 ${dstr(m.dmin)} ~ ${dstr(m.dmax)}</div>`;
    }
    const tools = m.type === 'categorical' ? `<button class="link" data-all>全選</button><button class="link" data-none>清除</button>` : '';
    return `<div class="fw" data-i="${m.idx}"><h5>${esc(m.name)} <span class="tag">${typeLabel[m.type]}</span>${tools}</h5>${body}</div>`;
  }).join('');
}
function collectFilters(){
  SEL = new Set([...document.querySelectorAll('#varList input')].filter(i => i.checked).map(i => META[+i.dataset.v].name));
  FILT = {};
  document.querySelectorAll('#filterGrid .fw').forEach(w => {
    const m = META[+w.dataset.i];
    if (m.type === 'categorical'){
      const boxes = [...w.querySelectorAll('input[data-o]')], on = boxes.filter(b => b.checked);
      if (on.length < boxes.length) FILT[m.idx] = {kind: 'cat', set: new Set(on.map(b => m.options[+b.dataset.o][0]))};
    } else if (m.type === 'numeric'){
      const a = w.querySelector('[data-min]').value, b = w.querySelector('[data-max]').value;
      if (a !== '' || b !== '') FILT[m.idx] = {kind: 'num', min: a === '' ? -Infinity : +a, max: b === '' ? Infinity : +b};
    } else {
      const a = w.querySelector('[data-from]').value, b = w.querySelector('[data-to]').value;
      if (a || b) FILT[m.idx] = {kind: 'date', from: a ? new Date(a) : new Date(-8.64e15), to: b ? new Date(new Date(b).getTime() + 86399999) : new Date(8.64e15)};
    }
  });
}
function applyFilters(rerender = true){
  const fs = Object.entries(FILT);
  ROWS = !fs.length ? RAW : RAW.filter(r => {
    for (const [i, f] of fs){
      const v = r[META[i].name];
      if (f.kind === 'cat'){ if (!f.set.has(catKey(v))) return false; }
      else if (f.kind === 'num'){ const x = toNum(v); if (isNaN(x) || x < f.min || x > f.max) return false; }
      else { const d = toDate(v); if (!d || d < f.from || d > f.to) return false; }
    }
    return true;
  });
  buildCols();
  $('#filterInfo').textContent = `目前分析 ${ROWS.length.toLocaleString()} / ${RAW.length.toLocaleString()} 列、${COLS.length} / ${META.length} 個變數` +
    (fs.length ? `（已套用 ${fs.length} 個內容篩選）` : '');
  statsDone = vizDone = false;
  if (rerender) showTab(curTab);
}
function resetFilters(){
  document.querySelectorAll('#varList input').forEach(i => i.checked = true);
  document.querySelectorAll('#filterGrid input[type=checkbox]').forEach(i => i.checked = true);
  document.querySelectorAll('#filterGrid input:not([type=checkbox])').forEach(i => i.value = '');
  collectFilters(); applyFilters();
}

/* ---------- 5. 統計分析 ---------- */
function renderStats(){
  const root = $('#stats');
  if (!ROWS.length || !COLS.length){ root.innerHTML = `<div class="card hint">${!ROWS.length ? '沒有符合條件的資料 試試放寬篩選器' : '至少要選一個變數'}</div>`; return; }
  const nc = COLS.filter(c => c.type === 'numeric' && c.st), cc = COLS.filter(c => c.type === 'categorical');
  const totalMiss = COLS.reduce((s, c) => s + c.missing, 0);
  const dup = ROWS.length - new Set(ROWS.map(r => JSON.stringify(r))).size;
  let h = `<div class="card"><h3>1. 資料概況</h3><div class="kpis">
    <div class="kpi"><span>資料列數</span><b>${ROWS.length.toLocaleString()}</b></div>
    <div class="kpi"><span>分析變數數</span><b>${COLS.length}</b></div>
    <div class="kpi"><span>數值變數</span><b>${nc.length}</b></div>
    <div class="kpi"><span>類別變數</span><b>${cc.length}</b></div>
    <div class="kpi"><span>日期變數</span><b>${COLS.filter(c => c.type === 'date').length}</b></div>
    <div class="kpi"><span>缺失值總數</span><b>${totalMiss.toLocaleString()}</b></div>
    <div class="kpi"><span>重複列</span><b>${dup}</b></div></div></div>`;
  h += `<div class="card"><h3>2. 變數型態與缺失值</h3>${table(['變數','型態','有效筆數','缺失筆數','缺失率','相異值數'],
    COLS.map(c => [esc(c.name), `<span class="tag">${typeLabel[c.type]}</span>`, c.n, c.missing, pct(c.missing / ROWS.length), c.unique]))}</div>`;
  if (nc.length){
    h += `<div class="card"><h3>3. 數值變數敘述統計</h3>${table(
      ['變數','N','平均數','標準差','變異數','最小值','Q1','中位數','Q3','最大值','IQR','變異係數','偏態','峰度(超額)'],
      nc.map(c => { const s = c.st; return [esc(c.name), s.n, fmt(s.mean), fmt(s.std), fmt(s.var), fmt(s.min), fmt(s.q1), fmt(s.med), fmt(s.q3), fmt(s.max), fmt(s.iqr), fmt(s.cv), fmt(s.skew, 3), fmt(s.kurt, 3)]; }))}
      <p class="note">偏態大於 0 代表資料偏右（右邊有長尾）、小於 0 代表偏左<br>峰度大於 0 代表分佈比常態分佈更尖</p></div>`;
    h += `<div class="card"><h3>4. 常態性檢定（Jarque-Bera）</h3>${table(['變數','JB 統計量','p 值','結論 (α=0.05)'],
      nc.map(c => { const s = c.st; return [esc(c.name), fmt(s.jb), fmt(s.jbp), s.n < 8 ? '樣本太少' : s.jbp >= .05 ? '無法拒絕常態' : '<span class="warn">拒絕常態</span>']; }))}
      <p class="note">這是大樣本的近似檢定 資料筆數少的時候只能參考</p></div>`;
    h += `<div class="card"><h3>5. 離群值偵測（IQR 法）</h3>${table(['變數','下界','上界','離群值個數','離群比例','最小離群值','最大離群值'],
      nc.map(c => { const s = c.st, o = s.out; return [esc(c.name), fmt(s.lo), fmt(s.hi), o.length, pct(o.length / s.n), o.length ? fmt(Math.min(...o)) : '-', o.length ? fmt(Math.max(...o)) : '-']; }))}</div>`;
  }
  if (nc.length >= 2){
    const use = nc.slice(0, 20), M = corrMatrix(use), names = use.map(c => c.name), pairs = [];
    for (let i = 0; i < use.length; i++) for (let j = i + 1; j < use.length; j++) if (!isNaN(M[i][j])) pairs.push([names[i], names[j], M[i][j]]);
    pairs.sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));
    const cell = r => { if (isNaN(r)) return '<td>-</td>'; const col = r >= 0 ? '37,99,235' : '220,38,38';
      return `<td style="background:rgba(${col},${Math.abs(r).toFixed(2)});color:${Math.abs(r) > .55 ? '#fff' : '#111'}">${r.toFixed(2)}</td>`; };
    h += `<div class="card"><h3>6. 相關係數矩陣（Pearson）</h3><div class="tw"><table class="hm"><thead><tr><th></th>${names.map(n => `<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>${
      M.map((row, i) => `<tr><td><b>${esc(names[i])}</b></td>${row.map(cell).join('')}</tr>`).join('')}</tbody></table></div>
      ${nc.length > 20 ? '<p class="note">變數太多 只顯示前 20 個數值變數</p>' : ''}</div>`;
    const lv = r => { const a = Math.abs(r); return (a >= .8 ? '極強' : a >= .6 ? '強' : a >= .4 ? '中等' : '弱') + (r > 0 ? '正相關' : '負相關'); };
    h += `<div class="card"><h3>7. 相關性最高的變數組合</h3>${table(['變數 A','變數 B','r','判讀'], pairs.slice(0, 15).map(p => [esc(p[0]), esc(p[1]), p[2].toFixed(3), lv(p[2])]))}</div>`;
  }
  cc.forEach((c, i) => {
    h += `<div class="card"><h3>${8 + i}. 類別變數「${esc(c.name)}」次數分配</h3>
      <p class="note">相異值 ${c.unique} 個<br>最常出現：${esc(c.freq[0]?.[0] ?? '-')}（${c.freq[0]?.[1] ?? 0} 次）${c.freq.length > 15 ? '<br>只顯示前 15 項' : ''}</p>
      ${table(['值','次數','比例'], c.freq.slice(0, 15).map(([k, v]) => [esc(k), v, pct(v / c.n)]))}</div>`;
  });
  // 類別 × 數值：分組平均
  const gcs = cc.filter(c => c.freq.length >= 2 && c.freq.length <= 10).slice(0, 2);
  gcs.forEach((g, gi) => {
    if (!nc.length) return;
    const rows = g.freq.map(([k]) => {
      const idx = []; g.keys.forEach((kk, t) => { if (kk === k) idx.push(t); });
      return [esc(k), idx.length, ...nc.slice(0, 8).map(c => { const v = idx.map(t => c.vec[t]).filter(x => !isNaN(x)); return v.length ? fmt(v.reduce((a, b) => a + b, 0) / v.length, 3) : '-'; })];
    });
    h += `<div class="card"><h3>${8 + cc.length + gi}. 依「${esc(g.name)}」分組的數值平均</h3>${table([esc(g.name), 'N', ...nc.slice(0, 8).map(c => esc(c.name))], rows)}</div>`;
  });
  root.innerHTML = h;
}

/* ---------- 6. 視覺化分析 ---------- */
Chart.register({id: 'whiteBg', beforeDraw(c){ const x = c.ctx; x.save(); x.globalCompositeOperation = 'destroy-over'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.restore(); }});
Chart.defaults.font.family = '-apple-system, "Noto Sans TC", "Microsoft JhengHei", sans-serif';

function section(title, note){
  const sec = el('div', 'card');
  sec.innerHTML = `<h3>${title}</h3>${note ? `<p class="note">${note}</p>` : ''}<div class="grid"></div>`;
  $('#viz').appendChild(sec);
  return {sec, grid: $('.grid', sec)};
}
function box(grid, title, kind, wide){
  const d = el('div', 'gc' + (wide ? ' wide' : ''));
  d.innerHTML = `<div class="gh"><h4 title="${esc(title)}">${esc(title)}</h4><button class="dl" title="下載 PNG">⬇ PNG</button></div><div class="gb"></div>`;
  grid.appendChild(d);
  const body = $('.gb', d);
  if (kind === 'canvas'){ const cv = el('canvas'); body.appendChild(cv); return cv; }
  return body;
}
function mk(cv, cfg){
  cfg.options = Object.assign({animation: false, responsive: true}, cfg.options || {});
  const c = new Chart(cv, cfg); charts.push(c); return c;
}
const axT = t => ({title: {display: true, text: t}});

/* --- 下載 PNG --- */
function saveBlob(blob, name){
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function downloadCard(gc){
  return new Promise(resolve => {
    const name = `${fileName}_${$('h4', gc).textContent}`.replace(/[\\/:*?"<>|\s]+/g, '_') + '.png';
    const cv = $('canvas', gc), sv = $('svg', gc);
    const out = (src, w, h) => {
      const c = el('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(src, 0, 0, w, h);
      c.toBlob(b => { saveBlob(b, name); resolve(); }, 'image/png');
    };
    if (cv) return out(cv, cv.width, cv.height);
    if (sv){
      const vb = sv.viewBox.baseVal, scale = 2, w = vb.width * scale, h = vb.height * scale;
      const clone = sv.cloneNode(true); clone.setAttribute('width', w); clone.setAttribute('height', h);
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], {type: 'image/svg+xml;charset=utf-8'}));
      const img = new Image(); img.onload = () => { out(img, w, h); URL.revokeObjectURL(url); }; img.onerror = () => resolve(); img.src = url;
      return;
    }
    resolve();
  });
}
async function downloadAll(){
  const items = [...document.querySelectorAll('#viz .gc')]; const btn = $('#dlAll');
  for (let i = 0; i < items.length; i++){ btn.textContent = `下載中 ${i + 1}/${items.length}…`; await downloadCard(items[i]); await sleep(300); }
  btn.textContent = '⬇ 下載全部圖片';
}

/* --- SVG 小工具 --- */
const svgWrap = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" font-family="sans-serif" font-size="11"><rect width="${w}" height="${h}" fill="#fff"/>${inner}</svg>`;
function yAxis(ticks, Y, x0, x1){
  return ticks.map(t => `<line x1="${x0}" x2="${x1}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="#eee"/><text x="${x0 - 5}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end" fill="#6b7280">${fmt(t, 2)}</text>`).join('');
}
function boxSVG(s){
  const W = 420, H = 90, L = 20, R = 20, rg = (s.max - s.min) || 1, X = v => L + (v - s.min) / rg * (W - L - R);
  const ticks = niceTicks(s.min, s.max, 6).filter(t => t >= s.min && t <= s.max);
  const out = s.out.slice(0, 200).map(v => `<circle cx="${X(v).toFixed(1)}" cy="38" r="3" fill="#ef4444" opacity=".55"/>`).join('');
  return svgWrap(W, H, `<line x1="${X(s.wl)}" x2="${X(s.wh)}" y1="38" y2="38" stroke="#6b7280"/>
    <line x1="${X(s.wl)}" x2="${X(s.wl)}" y1="28" y2="48" stroke="#6b7280"/><line x1="${X(s.wh)}" x2="${X(s.wh)}" y1="28" y2="48" stroke="#6b7280"/>
    <rect x="${X(s.q1)}" y="22" width="${Math.max(1, X(s.q3) - X(s.q1))}" height="32" fill="#dbeafe" stroke="#2563eb"/>
    <line x1="${X(s.med)}" x2="${X(s.med)}" y1="22" y2="54" stroke="#1d4ed8" stroke-width="2.5"/>
    <circle cx="${X(s.mean)}" cy="38" r="4" fill="#f59e0b"/>${out}
    <line x1="${L}" x2="${W - R}" y1="68" y2="68" stroke="#9ca3af"/>
    ${ticks.map(t => `<line x1="${X(t)}" x2="${X(t)}" y1="68" y2="73" stroke="#9ca3af"/><text x="${X(t)}" y="85" text-anchor="middle" fill="#6b7280">${fmt(t, 2)}</text>`).join('')}
    <text x="${W - R}" y="12" text-anchor="end" fill="#6b7280">藍框 Q1–Q3｜深藍線 中位數｜橘點 平均｜紅點 離群值</text>`);
}
function violinSVG(s){
  const W = 300, H = 280, L = 52, T = 14, B = 24, Y = v => H - B - (v - s.min) / ((s.max - s.min) || 1) * (H - T - B);
  const G = 60, grid = Array.from({length: G}, (_, i) => s.min + (s.max - s.min) * i / (G - 1) || s.min), d = kde(s.a, grid), mx = Math.max(...d) || 1;
  const cx = (L + W - 10) / 2, hw = (W - L - 10) / 2 - 6;
  const right = grid.map((g, i) => `${(cx + d[i] / mx * hw).toFixed(1)},${Y(g).toFixed(1)}`);
  const left = grid.map((g, i) => `${(cx - d[i] / mx * hw).toFixed(1)},${Y(g).toFixed(1)}`).reverse();
  return svgWrap(W, H, yAxis(niceTicks(s.min, s.max, 5).filter(t => t >= s.min && t <= s.max), Y, L, W - 10) +
    `<polygon points="${right.concat(left).join(' ')}" fill="#bfdbfe" stroke="#2563eb" stroke-width="1.2"/>
     <rect x="${cx - 6}" y="${Y(s.q3)}" width="12" height="${Math.max(1, Y(s.q1) - Y(s.q3))}" fill="#1e3a8a"/>
     <circle cx="${cx}" cy="${Y(s.med)}" r="3.5" fill="#fff"/>`);
}
function heatSVG(rl, cl, M, colorFn, textFn, cell = 40){
  const L = 110, T = 100, W = L + cl.length * cell + 70, H = T + rl.length * cell + 10;
  let s = cl.map((c, j) => `<text transform="translate(${L + j * cell + cell / 2},${T - 6}) rotate(-45)" fill="#374151">${esc(cut(c, 14))}</text>`).join('');
  s += rl.map((r, i) => `<text x="${L - 6}" y="${T + i * cell + cell / 2 + 4}" text-anchor="end" fill="#374151">${esc(cut(r, 16))}</text>`).join('');
  M.forEach((row, i) => row.forEach((v, j) => {
    const [bg, fg] = colorFn(v);
    s += `<rect x="${L + j * cell}" y="${T + i * cell}" width="${cell}" height="${cell}" fill="${bg}" stroke="#fff"/><text x="${L + j * cell + cell / 2}" y="${T + i * cell + cell / 2 + 4}" text-anchor="middle" fill="${fg}">${textFn(v)}</text>`;
  }));
  return svgWrap(W, H, s);
}
function corrColor(r){ if (isNaN(r)) return ['#f3f4f6', '#9ca3af']; const a = Math.abs(r), col = r >= 0 ? '37,99,235' : '220,38,38'; return [`rgba(${col},${a.toFixed(2)})`, a > .55 ? '#fff' : '#111']; }
function treemapSVG(items){
  const W = 480, H = 300, out = [];
  (function tm(list, x, y, w, h){
    if (list.length === 1){ out.push({...list[0], x, y, w, h}); return; }
    const tot = list.reduce((a, b) => a + b.v, 0); let acc = 0, i = 0;
    while (i < list.length - 1 && acc + list[i].v < tot / 2){ acc += list[i].v; i++; }
    if (i === 0){ acc = list[0].v; i = 1; }
    const f = acc / tot, A = list.slice(0, i), B = list.slice(i);
    if (w >= h){ tm(A, x, y, w * f, h); tm(B, x + w * f, y, w * (1 - f), h); } else { tm(A, x, y, w, h * f); tm(B, x, y + h * f, w, h * (1 - f)); }
  })(items, 0, 0, W, H);
  const tot = items.reduce((a, b) => a + b.v, 0);
  return svgWrap(W, H, out.map((o, i) => `<rect x="${o.x.toFixed(1)}" y="${o.y.toFixed(1)}" width="${o.w.toFixed(1)}" height="${o.h.toFixed(1)}" fill="${PAL[i % PAL.length]}" stroke="#fff" stroke-width="2"/>` +
    (o.w > 46 && o.h > 30 ? `<text x="${(o.x + 6).toFixed(1)}" y="${(o.y + 16).toFixed(1)}" fill="#fff" font-size="12" font-weight="600">${esc(cut(o.k, Math.max(3, Math.floor(o.w / 8))))}</text><text x="${(o.x + 6).toFixed(1)}" y="${(o.y + 31).toFixed(1)}" fill="#fff" opacity=".9">${o.v} (${pct(o.v / tot)})</text>` : '')).join(''));
}
function groupBoxSVG(groups){ // groups: [{k, s}]
  const W = Math.max(320, 56 * groups.length + 70), H = 270, L = 56, T = 14, B = 40;
  const lo = Math.min(...groups.map(g => g.s.min)), hi = Math.max(...groups.map(g => g.s.max));
  const Y = v => H - B - (v - lo) / ((hi - lo) || 1) * (H - T - B), bw = (W - L - 10) / groups.length;
  let s = yAxis(niceTicks(lo, hi, 5).filter(t => t >= lo && t <= hi), Y, L, W - 10);
  groups.forEach((g, i) => {
    const c = L + bw * (i + .5), w = Math.min(34, bw * .6), st = g.s, col = PAL[i % PAL.length];
    s += `<line x1="${c}" x2="${c}" y1="${Y(st.wl)}" y2="${Y(st.wh)}" stroke="#6b7280"/>
      <line x1="${c - w / 4}" x2="${c + w / 4}" y1="${Y(st.wl)}" y2="${Y(st.wl)}" stroke="#6b7280"/><line x1="${c - w / 4}" x2="${c + w / 4}" y1="${Y(st.wh)}" y2="${Y(st.wh)}" stroke="#6b7280"/>
      <rect x="${c - w / 2}" y="${Y(st.q3)}" width="${w}" height="${Math.max(1, Y(st.q1) - Y(st.q3))}" fill="${col}" fill-opacity=".35" stroke="${col}"/>
      <line x1="${c - w / 2}" x2="${c + w / 2}" y1="${Y(st.med)}" y2="${Y(st.med)}" stroke="${col}" stroke-width="2.5"/>
      <circle cx="${c}" cy="${Y(st.mean)}" r="3" fill="#f59e0b"/>` +
      st.out.slice(0, 60).map(v => `<circle cx="${c}" cy="${Y(v)}" r="2.2" fill="#ef4444" opacity=".6"/>`).join('') +
      `<text x="${c}" y="${H - B + 14}" text-anchor="middle" fill="#374151">${esc(cut(g.k, 7))}</text><text x="${c}" y="${H - B + 27}" text-anchor="middle" fill="#9ca3af">n=${st.n}</text>`;
  });
  return svgWrap(W, H, s);
}
function panelsSVG(panels, xl){
  const W = 680, L = 56, R = 10, ph = 92, gap = 28, H = panels.length * (ph + gap) + 26;
  let s = '';
  panels.forEach((p, k) => {
    const top = 18 + k * (ph + gap), v = p.data.filter(x => !isNaN(x)), lo = Math.min(...v), hi = Math.max(...v);
    const Y = y => top + ph - (y - lo) / ((hi - lo) || 1) * ph, X = i => L + i / Math.max(1, p.data.length - 1) * (W - L - R);
    s += `<text x="${L}" y="${top - 6}" font-weight="600" fill="#374151">${esc(p.name)}</text>` + yAxis(niceTicks(lo, hi, 3).filter(t => t >= lo && t <= hi), Y, L, W - R);
    let d = '', pen = false;
    p.data.forEach((y, i) => { if (isNaN(y)){ pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(y).toFixed(1)}`; pen = true; });
    s += `<path d="${d}" fill="none" stroke="${p.color}" stroke-width="1.5"/>`;
  });
  const n = xl.length, base = H - 6;
  [0, Math.floor((n - 1) / 2), n - 1].forEach((i, j) => { s += `<text x="${L + i / Math.max(1, n - 1) * (W - L - R)}" y="${base}" text-anchor="${j === 0 ? 'start' : j === 2 ? 'end' : 'middle'}" fill="#6b7280">${xl[i]}</text>`; });
  return svgWrap(W, H, s);
}

function groupBy(cat){ return cat ? cat.freq.slice(0, 8).map(f => f[0]) : []; }

function renderViz(){
  charts.forEach(c => { try { c.destroy(); } catch (e){} }); charts = [];
  const root = $('#viz'); root.innerHTML = '';
  if (!ROWS.length || !COLS.length){ root.innerHTML = `<div class="card hint">${!ROWS.length ? '沒有符合條件的資料 試試放寬篩選器' : '至少要選一個變數'}</div>`; return; }
  const nc = COLS.filter(c => c.type === 'numeric' && c.st), cc = COLS.filter(c => c.type === 'categorical'), dc = COLS.filter(c => c.type === 'date');
  const tb = el('div', 'toolbar'); tb.innerHTML = `<button class="btn" id="dlAll">⬇ 下載全部圖片</button><span class="note">每張圖右上角的「⬇ PNG」可以單獨下載<br>系統會依資料自動決定要畫哪些圖</span>`;
  root.appendChild(tb); $('#dlAll').addEventListener('click', downloadAll);
  const info = [`數值 ${nc.length}`, `類別 ${cc.length}`, `日期 ${dc.length}`].join('、');
  const N1 = nc.slice(0, 12);
  const sections = [];
  const run = (name, fn) => { try { fn(); } catch (e){ console.error(name, e); } };

  // 0. 缺失值
  run('missing', () => {
    const {grid} = section('1. 缺失值', `自動偵測到的變數：${info}`);
    const hasMiss = COLS.some(c => c.missing > 0);
    if (!hasMiss){ grid.parentNode.insertAdjacentHTML('beforeend', '<p class="note">✅ 沒有缺失值</p>'); return; }
    mk(box(grid, '各變數缺失率', 'canvas'), {type: 'bar', data: {labels: COLS.map(c => c.name), datasets: [{label: '缺失率 (%)', data: COLS.map(c => +(c.missing / ROWS.length * 100).toFixed(2)), backgroundColor: '#f59e0b'}]},
      options: {indexAxis: 'y', plugins: {legend: {display: false}}, scales: {x: {max: 100, ...axT('%')}}}});
    const rows = sample(ROWS.map((r, i) => i), 150), cw = 22, ch = 5, L = 10, T = 90, W = L + COLS.length * cw + 70, H = T + rows.length * ch + 10;
    let s = COLS.map((c, j) => `<text transform="translate(${L + j * cw + cw / 2},${T - 6}) rotate(-45)" fill="#374151">${esc(cut(c.name, 14))}</text>`).join('');
    rows.forEach((ri, i) => COLS.forEach((c, j) => { s += `<rect x="${L + j * cw}" y="${T + i * ch}" width="${cw - 1}" height="${ch}" fill="${isEmpty(ROWS[ri][c.name]) ? '#ef4444' : '#e5e7eb'}"/>`; }));
    box(grid, '缺失值模式圖', 'svg').innerHTML = svgWrap(W, H, s + `<text x="${L}" y="${H - 1}" fill="#6b7280" font-size="9">紅色＝缺失（抽樣 ${rows.length} 列）</text>`);
  });

  // 1. 數值單變數
  if (nc.length) run('numeric', () => {
    const more = nc.length > 12 ? `<br>變數太多 只顯示前 12 個數值變數 想看其他的可以用篩選器挑選` : '';
    let {grid} = section('2. 數值變數分佈：直方圖＋密度曲線', `藍色長條是各區間的筆數、紅線是分佈的平滑曲線 (KDE)${more}`);
    N1.forEach((c, i) => {
      const s = c.st, k = Math.min(30, Math.max(5, Math.ceil(Math.log2(s.n) + 1))), w = (s.max - s.min) / k || 1, bins = Array(k).fill(0);
      s.a.forEach(v => { bins[Math.min(k - 1, Math.floor((v - s.min) / w))]++; });
      const centers = bins.map((_, j) => s.min + (j + .5) * w), dens = kde(s.a, centers).map(d => d * s.n * w);
      mk(box(grid, `${c.name}：直方圖＋密度`, 'canvas'), {type: 'bar', data: {labels: centers.map(v => fmt(v, 2)),
        datasets: [{type: 'bar', label: '次數', data: bins, backgroundColor: PAL[i % 10] + 'cc', barPercentage: 1, categoryPercentage: 1, order: 2},
                   {type: 'line', label: '密度估計', data: dens, borderColor: '#ef4444', pointRadius: 0, tension: .4, order: 1}]}, options: {scales: {y: axT('次數')}}});
    });
    ({grid} = section('3. 盒鬚圖與小提琴圖', '盒鬚圖：看中位數、中間 50% 的範圍和離群值<br>小提琴圖：看資料集中在哪 越寬代表越多（黑條是中間 50%、白點是中位數）'));
    N1.forEach(c => { box(grid, `${c.name}：盒鬚圖`, 'svg').innerHTML = boxSVG(c.st); });
    N1.forEach(c => { box(grid, `${c.name}：小提琴圖`, 'svg').innerHTML = violinSVG(c.st); });
    ({grid} = section('4. Q-Q 圖（常態性）與累積分佈圖 (ECDF)', 'Q-Q 圖：點越貼近紅線 資料越接近常態分佈<br>累積分佈圖：看有多少比例的資料小於等於某個值'));
    N1.forEach((c, i) => {
      const s = c.st, m = Math.min(s.n, 300), pts = [];
      for (let j = 0; j < m; j++){ const idx = Math.floor((j + .5) / m * s.n); pts.push({x: qnorm((idx + .5) / s.n), y: s.std > 0 ? (s.a[idx] - s.mean) / s.std : 0}); }
      mk(box(grid, `${c.name}：Q-Q 圖`, 'canvas'), {type: 'scatter', data: {datasets: [{label: '資料', data: pts, backgroundColor: '#2563eb99', pointRadius: 2.5},
        {type: 'line', label: '常態參考線', data: [{x: -3, y: -3}, {x: 3, y: 3}], borderColor: '#ef4444', pointRadius: 0, borderWidth: 1.5}]},
        options: {scales: {x: axT('理論分位數'), y: axT('標準化樣本分位數')}}});
    });
    N1.forEach((c, i) => {
      const s = c.st, m = Math.min(s.n, 300), pts = [];
      for (let j = 0; j < m; j++){ const idx = Math.min(s.n - 1, Math.floor((j + 1) / m * s.n - 1e-9)); pts.push({x: s.a[idx], y: (idx + 1) / s.n}); }
      mk(box(grid, `${c.name}：累積分佈圖`, 'canvas'), {type: 'scatter', data: {datasets: [{label: 'ECDF', data: pts, showLine: true, stepped: 'after', pointRadius: 0, borderColor: PAL[i % 10], borderWidth: 2}]},
        options: {plugins: {legend: {display: false}}, scales: {x: axT(c.name), y: {...axT('累積比例'), min: 0, max: 1}}}});
    });
  });

  // 2. 類別
  if (cc.length) run('categorical', () => {
    const {grid} = section('5. 類別變數：長條圖、圓餅圖、樹狀圖', cc.length > 8 ? '類別變數太多 只顯示前 8 個' : '');
    cc.slice(0, 8).forEach((c, i) => {
      const top = c.freq.slice(0, 10);
      mk(box(grid, `${c.name}：長條圖${c.freq.length > 10 ? '（前10）' : ''}`, 'canvas'), {type: 'bar', data: {labels: top.map(x => x[0]), datasets: [{data: top.map(x => x[1]), backgroundColor: PAL[i % 10]}]},
        options: {indexAxis: 'y', plugins: {legend: {display: false}}, scales: {x: axT('次數')}}});
      const p8 = c.freq.slice(0, 8), rest = c.freq.slice(8).reduce((a, b) => a + b[1], 0), pl = rest ? [...p8, ['其他', rest]] : p8;
      mk(box(grid, `${c.name}：圓餅圖`, 'canvas'), {type: 'pie', data: {labels: pl.map(x => `${cut(x[0], 12)} (${pct(x[1] / c.n)})`), datasets: [{data: pl.map(x => x[1]), backgroundColor: PAL}]},
        options: {plugins: {legend: {position: 'right'}}}});
      box(grid, `${c.name}：樹狀圖`, 'svg').innerHTML = treemapSVG(c.freq.slice(0, 30).map(([k, v]) => ({k, v})));
    });
  });

  // 3. 相關性
  if (nc.length >= 2) run('corr', () => {
    const use = nc.slice(0, 20), M = corrMatrix(use), names = use.map(c => c.name);
    let {grid} = section('6. 變數關係：相關係數熱圖與散佈圖矩陣', '藍色代表一起上升（正相關）、紅色代表一升一降（負相關） 顏色越深關係越強');
    box(grid, '相關係數熱圖', 'svg', true).innerHTML = heatSVG(names, names, M, corrColor, v => isNaN(v) ? '-' : v.toFixed(2));
    const avg = use.map((_, i) => M[i].reduce((a, v, j) => a + (i === j || isNaN(v) ? 0 : Math.abs(v)), 0));
    const pick = use.map((c, i) => i).sort((a, b) => avg[b] - avg[a]).slice(0, 5).sort((a, b) => a - b);
    if (pick.length >= 2){
      const P = 130, Lm = 8, W = Lm + pick.length * P + 8; let s = '';
      const sub = sample(ROWS.map((r, i) => i), 250);
      pick.forEach((a, r) => pick.forEach((b, cI) => {
        const x0 = Lm + cI * P, y0 = Lm + r * P; s += `<rect x="${x0}" y="${y0}" width="${P}" height="${P}" fill="none" stroke="#d1d5db"/>`;
        if (a === b){ s += `<text x="${x0 + P / 2}" y="${y0 + P / 2 + 4}" text-anchor="middle" font-weight="600" fill="#374151">${esc(cut(use[a].name, 14))}</text>`; return; }
        const xs = use[b].st, ys = use[a].st, X = v => x0 + 8 + (v - xs.min) / ((xs.max - xs.min) || 1) * (P - 16), Y = v => y0 + P - 8 - (v - ys.min) / ((ys.max - ys.min) || 1) * (P - 16);
        sub.forEach(t => { const vx = use[b].vec[t], vy = use[a].vec[t]; if (!isNaN(vx) && !isNaN(vy)) s += `<circle cx="${X(vx).toFixed(1)}" cy="${Y(vy).toFixed(1)}" r="1.8" fill="#2563eb" opacity=".45"/>`; });
        s += `<text x="${x0 + 5}" y="${y0 + 12}" fill="#6b7280" font-size="9">r=${M[a][b].toFixed(2)}</text>`;
      }));
      box(grid, '散佈圖矩陣', 'svg', true).innerHTML = svgWrap(W, Lm * 2 + pick.length * P, s);
    }
    const pairs = [];
    for (let i = 0; i < use.length; i++) for (let j = i + 1; j < use.length; j++) if (!isNaN(M[i][j])) pairs.push([i, j, M[i][j]]);
    pairs.sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));
    const top = pairs.slice(0, 4);
    ({grid} = section('7. 迴歸線與殘差圖', '挑出關係最強的幾組變數<br>迴歸線圖：紅線是整體趨勢<br>殘差圖：點如果隨機散在 0 附近 代表這條線配得不錯'));
    top.forEach(([i, j, r]) => {
      const pts = []; sample(ROWS.map((_, t) => t), 600).forEach(t => { const x = use[i].vec[t], y = use[j].vec[t]; if (!isNaN(x) && !isNaN(y)) pts.push({x, y}); });
      const f = ols(pts), xs = use[i].st, line = [{x: xs.min, y: f.a + f.b * xs.min}, {x: xs.max, y: f.a + f.b * xs.max}];
      mk(box(grid, `${use[j].name} ~ ${use[i].name}：迴歸線`, 'canvas'), {type: 'scatter', data: {datasets: [{label: '資料', data: pts, backgroundColor: '#2563eb88', pointRadius: 3},
        {type: 'line', label: `y = ${fmt(f.a, 3)} + ${fmt(f.b, 3)}x （R² = ${f.r2.toFixed(3)}）`, data: line, borderColor: '#ef4444', pointRadius: 0, borderWidth: 2}]},
        options: {plugins: {legend: {display: true}}, scales: {x: axT(use[i].name), y: axT(use[j].name)}}});
      const res = pts.map(p => ({x: f.a + f.b * p.x, y: p.y - (f.a + f.b * p.x)})), rx = res.map(p => p.x);
      mk(box(grid, `${use[j].name} ~ ${use[i].name}：殘差圖`, 'canvas'), {type: 'scatter', data: {datasets: [{label: '殘差', data: res, backgroundColor: '#8b5cf688', pointRadius: 3},
        {type: 'line', label: '0', data: [{x: Math.min(...rx), y: 0}, {x: Math.max(...rx), y: 0}], borderColor: '#ef4444', pointRadius: 0, borderWidth: 1.5}]},
        options: {plugins: {legend: {display: false}}, scales: {x: axT('預測值'), y: axT('殘差')}}});
    });
    if (use.length >= 3 && pairs.length){
      ({grid} = section('8. 氣泡圖', '橫軸和縱軸是關係最強的兩個變數 氣泡越大代表第三個變數的值越大'));
      pairs.slice(0, 2).forEach(([i, j]) => {
        let k = -1, best = -1; use.forEach((c, t) => { if (t !== i && t !== j){ const sc = (Math.abs(M[i][t]) || 0) + (Math.abs(M[j][t]) || 0); if (sc > best){ best = sc; k = t; } } });
        if (k < 0) return;
        const z = use[k].st, data = [];
        sample(ROWS.map((_, t) => t), 250).forEach(t => { const x = use[i].vec[t], y = use[j].vec[t], v = use[k].vec[t]; if (!isNaN(x) && !isNaN(y) && !isNaN(v)) data.push({x, y, r: 3 + (v - z.min) / ((z.max - z.min) || 1) * 13, v}); });
        mk(box(grid, `氣泡圖：${use[i].name} × ${use[j].name}（大小＝${use[k].name}）`, 'canvas'), {type: 'bubble', data: {datasets: [{label: use[k].name, data, backgroundColor: '#2563eb55', borderColor: '#2563eb'}]},
          options: {plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => `x=${fmt(c.raw.x, 2)}, y=${fmt(c.raw.y, 2)}, ${use[k].name}=${fmt(c.raw.v, 2)}`}}}, scales: {x: axT(use[i].name), y: axT(use[j].name)}}});
      });
    }
  });

  // 4. 多變數：平行座標、雷達
  const gcat = cc.find(c => c.freq.length >= 2 && c.freq.length <= 8);
  if (nc.length >= 3) run('multivar', () => {
    const v = nc.slice(0, 8), groups = groupBy(gcat);
    const {grid} = section('9. 多變數比較：平行座標圖與雷達圖', `各變數都已縮放到 0–1 方便比較${gcat ? `<br>顏色依「${esc(gcat.name)}」分組` : ''}`);
    const idx = sample(ROWS.map((_, t) => t).filter(t => v.every(c => !isNaN(c.vec[t]))), 150);
    if (idx.length){
      const norm = (c, x) => (x - c.st.min) / ((c.st.max - c.st.min) || 1);
      mk(box(grid, '平行座標圖', 'canvas', true), {type: 'line', data: {labels: v.map(c => c.name), datasets: idx.map(t => {
        const gi = gcat ? groups.indexOf(gcat.keys[t]) : 0, col = gi < 0 ? '#9ca3af' : PAL[gi % 10];
        return {data: v.map(c => norm(c, c.vec[t])), borderColor: col + '55', borderWidth: 1, pointRadius: 0}; })},
        options: {aspectRatio: 2.6, plugins: {legend: {display: !!gcat, labels: {generateLabels: () => groups.map((g, i) => ({text: g, fillStyle: PAL[i % 10], strokeStyle: PAL[i % 10], lineWidth: 0}))}, onClick: null}, tooltip: {enabled: false}}, scales: {y: {min: 0, max: 1}}}});
    }
    if (gcat){
      const ds = groups.map((g, gi) => {
        const rows = []; gcat.keys.forEach((k, t) => { if (k === g) rows.push(t); });
        return {label: g, data: v.map(c => { const x = rows.map(t => c.vec[t]).filter(q => !isNaN(q)); return x.length ? ((x.reduce((a, b) => a + b, 0) / x.length) - c.st.min) / ((c.st.max - c.st.min) || 1) : 0; }),
          borderColor: PAL[gi % 10], backgroundColor: PAL[gi % 10] + '22', borderWidth: 2, pointRadius: 2};
      });
      mk(box(grid, `雷達圖（各${gcat.name}的平均）`, 'canvas'), {type: 'radar', data: {labels: v.map(c => c.name), datasets: ds}, options: {aspectRatio: 1.1, scales: {r: {min: 0, max: 1, ticks: {display: false}}}}});
    }
  });

  // 5. 分組比較
  const gcols = cc.filter(c => c.freq.length >= 2 && c.freq.length <= 10).slice(0, 2);
  if (gcols.length && nc.length) run('group', () => {
    const {grid} = section('10. 分組比較：依類別看數值差異', '看不同類別之間的數值差異<br>盒鬚圖的橘點是平均 長條圖是各組平均');
    gcols.forEach(g => nc.slice(0, 4).forEach((c, ci) => {
      const gs = g.freq.map(([k]) => { const v = []; g.keys.forEach((kk, t) => { if (kk === k && !isNaN(c.vec[t])) v.push(c.vec[t]); }); return {k, s: numStats(v)}; }).filter(x => x.s);
      if (!gs.length) return;
      box(grid, `${c.name} 依 ${g.name}：分組盒鬚圖`, 'svg').innerHTML = groupBoxSVG(gs);
      mk(box(grid, `${c.name} 依 ${g.name}：平均`, 'canvas'), {type: 'bar', data: {labels: gs.map(x => x.k), datasets: [{data: gs.map(x => +x.s.mean.toFixed(4)), backgroundColor: PAL[ci % 10]}]}, options: {plugins: {legend: {display: false}}, scales: {y: axT('平均 ' + c.name)}}});
    }));
  });
  const ccs = cc.filter(c => c.freq.length >= 2 && c.freq.length <= 12);
  if (ccs.length >= 2) run('crosstab', () => {
    const {grid} = section('11. 兩個類別變數交叉：堆疊長條圖與群組長條圖');
    const pairs = []; for (let i = 0; i < ccs.length && pairs.length < 3; i++) for (let j = i + 1; j < ccs.length && pairs.length < 3; j++) pairs.push([ccs[i], ccs[j]]);
    pairs.forEach(([a, b]) => {
      const A = a.freq.slice(0, 10).map(x => x[0]), B = b.freq.slice(0, 8).map(x => x[0]), cnt = {};
      a.keys.forEach((ka, t) => { const kb = b.keys[t]; if (ka === null || kb === null) return; const key = ka + '\u0001' + kb; cnt[key] = (cnt[key] || 0) + 1; });
      const ds = B.map((kb, i) => ({label: kb, data: A.map(ka => cnt[ka + '\u0001' + kb] || 0), backgroundColor: PAL[i % 10]}));
      mk(box(grid, `${a.name} × ${b.name}：堆疊長條圖`, 'canvas'), {type: 'bar', data: {labels: A, datasets: ds}, options: {scales: {x: {stacked: true}, y: {stacked: true, ...axT('次數')}}}});
      mk(box(grid, `${a.name} × ${b.name}：群組長條圖`, 'canvas'), {type: 'bar', data: {labels: A, datasets: ds}, options: {scales: {y: axT('次數')}}});
    });
  });

  // 6. 時間序列
  if (dc.length && nc.length) run('timeseries', () => {
    const d = dc[0], {grid} = section(`12. 時間序列（依「${esc(d.name)}」）`, '同一天有多筆資料時取平均<br>包含趨勢、移動平均、時間序列分解、自相關圖、星期×月份熱力圖');
    nc.slice(0, 3).forEach((c, ci) => {
      const m = new Map(); d.dvec.forEach((dt, t) => { if (dt && !isNaN(c.vec[t])){ const k = dstr(dt), o = m.get(k) || [0, 0]; o[0] += c.vec[t]; o[1]++; m.set(k, o); } });
      const ser = [...m.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([k, o]) => ({k, y: o[0] / o[1], t: new Date(k).getTime()}));
      const n = ser.length; if (n < 5) return;
      const y = ser.map(s => s.y), w = Math.max(3, Math.round(n / 20));
      const ma = y.map((_, i) => i < w - 1 ? NaN : y.slice(i - w + 1, i + 1).reduce((a, b) => a + b, 0) / w);
      const st = Math.max(1, Math.ceil(n / 400)), ix = ser.map((_, i) => i).filter(i => i % st === 0);
      mk(box(grid, `${c.name}：趨勢＋${w} 期移動平均`, 'canvas'), {type: 'line', data: {labels: ix.map(i => ser[i].k), datasets: [
        {label: '原始', data: ix.map(i => y[i]), borderColor: PAL[ci] + '88', borderWidth: 1, pointRadius: 0},
        {label: `${w} 期移動平均`, data: ix.map(i => isNaN(ma[i]) ? null : ma[i]), borderColor: '#ef4444', borderWidth: 2.5, pointRadius: 0}]}, options: {plugins: {legend: {display: true}}}});
      // 分解
      const gaps = ser.slice(1).map((s, i) => (s.t - ser[i].t) / 864e5).sort((a, b) => a - b), gap = gaps[Math.floor(gaps.length / 2)] || 1;
      let p = gap <= 1.5 ? 7 : gap <= 8 ? (n >= 104 ? 52 : 4) : gap <= 35 ? 12 : gap <= 100 ? 4 : Math.max(2, Math.min(12, Math.floor(n / 4)));
      if (n >= 2 * p){
        const half = Math.floor(p / 2), trend = y.map((_, i) => {
          if (i < half || i >= n - half) return NaN;
          if (p % 2) return y.slice(i - half, i + half + 1).reduce((a, b) => a + b, 0) / p;
          let s = 0; for (let k = -half; k <= half; k++) s += y[i + k] * (Math.abs(k) === half ? .5 : 1); return s / p;
        });
        const sea = Array(p).fill(0), cn = Array(p).fill(0);
        y.forEach((v, i) => { if (!isNaN(trend[i])){ sea[i % p] += v - trend[i]; cn[i % p]++; } });
        const sm = sea.map((s, i) => cn[i] ? s / cn[i] : 0), mean = sm.reduce((a, b) => a + b, 0) / p, seas = y.map((_, i) => sm[i % p] - mean);
        const res = y.map((v, i) => isNaN(trend[i]) ? NaN : v - trend[i] - seas[i]);
        const xl = ser.map(s => s.k);
        box(grid, `${c.name}：時間序列分解（週期 ${p}）`, 'svg', true).innerHTML = panelsSVG([{name: '原始', data: y, color: '#2563eb'}, {name: '趨勢', data: trend, color: '#10b981'}, {name: '季節性', data: seas, color: '#f59e0b'}, {name: '殘差', data: res, color: '#ef4444'}], xl);
      }
      // ACF / PACF
      if (n >= 10){
        const ml = Math.min(30, Math.floor(n / 3)), a = acf(y, ml), pa = pacf(a, ml), bound = 1.96 / Math.sqrt(n), labels = a.map((_, i) => i + 1);
        const band = [{type: 'line', label: '+95%', data: labels.map(() => bound), borderColor: '#ef4444', borderDash: [5, 4], pointRadius: 0, borderWidth: 1}, {type: 'line', label: '−95%', data: labels.map(() => -bound), borderColor: '#ef4444', borderDash: [5, 4], pointRadius: 0, borderWidth: 1}];
        mk(box(grid, `${c.name}：ACF 自相關圖`, 'canvas'), {type: 'bar', data: {labels, datasets: [{label: 'ACF', data: a, backgroundColor: '#2563eb'}, ...band]}, options: {scales: {x: axT('落後期數'), y: {min: -1, max: 1}}}});
        mk(box(grid, `${c.name}：PACF 偏自相關圖`, 'canvas'), {type: 'bar', data: {labels, datasets: [{label: 'PACF', data: pa, backgroundColor: '#8b5cf6'}, ...band]}, options: {scales: {x: axT('落後期數'), y: {min: -1, max: 1}}}});
      }
      // 星期×月份熱力圖
      if (ci < 2){
        const sum = Array.from({length: 7}, () => Array(12).fill(0)), cnt = Array.from({length: 7}, () => Array(12).fill(0));
        d.dvec.forEach((dt, t) => { if (dt && !isNaN(c.vec[t])){ const wd = (dt.getUTCDay() + 6) % 7, mo = dt.getUTCMonth(); sum[wd][mo] += c.vec[t]; cnt[wd][mo]++; } });
        const M = sum.map((r, i) => r.map((s, j) => cnt[i][j] ? s / cnt[i][j] : NaN)), flat = M.flat().filter(v => !isNaN(v));
        if (flat.length > 1){
          const lo = Math.min(...flat), hi = Math.max(...flat);
          const col = v => { if (isNaN(v)) return ['#f3f4f6', '#9ca3af']; const f = (v - lo) / ((hi - lo) || 1); return [`rgba(37,99,235,${(.08 + f * .92).toFixed(2)})`, f > .55 ? '#fff' : '#111']; };
          box(grid, `${c.name}：星期×月份熱力圖（平均）`, 'svg', true).innerHTML = heatSVG(['週一','週二','週三','週四','週五','週六','週日'], Array.from({length: 12}, (_, i) => `${i + 1}月`), M, col, v => isNaN(v) ? '' : fmt(v, 1), 46);
        }
      }
    });
  });

  // 7. PCA / K-means
  if (nc.length >= 2) run('pca', () => {
    const v = nc.slice(0, 10), rows = ROWS.map((_, t) => t).filter(t => v.every(c => !isNaN(c.vec[t])));
    if (rows.length < 10) return;
    const sub = sample(rows, 1500), mu = v.map(c => sub.reduce((a, t) => a + c.vec[t], 0) / sub.length);
    const sd = v.map((c, j) => Math.sqrt(sub.reduce((a, t) => a + (c.vec[t] - mu[j]) ** 2, 0) / (sub.length - 1)) || 1);
    const Z = sub.map(t => v.map((c, j) => (c.vec[t] - mu[j]) / sd[j]));
    const k = v.length, C = Array.from({length: k}, (_, i) => Array.from({length: k}, (_, j) => Z.reduce((a, z) => a + z[i] * z[j], 0) / (Z.length - 1)));
    const {vals, V} = eigSym(C), ord = vals.map((_, i) => i).sort((a, b) => vals[b] - vals[a]), tot = vals.reduce((a, b) => a + b, 0);
    const sc = Z.map(z => [0, 1].map(q => z.reduce((a, zj, j) => a + zj * V[j][ord[q]], 0)));
    const {grid, sec} = section('13. 降維與分群：PCA、K-means', `使用變數：${v.map(c => esc(c.name)).join('、')}<br>只用沒有缺失的 ${rows.length} 筆資料${rows.length > 1500 ? '（隨機取 1500 筆）' : ''}`);
    const ev = ord.map(i => vals[i] / tot);
    mk(box(grid, 'PCA：陡坡圖（解釋變異）', 'canvas'), {type: 'bar', data: {labels: ev.map((_, i) => 'PC' + (i + 1)), datasets: [{label: '解釋變異比例', data: ev.map(x => +(x * 100).toFixed(2)), backgroundColor: '#2563eb'},
      {type: 'line', label: '累積 (%)', data: ev.map((_, i) => +(ev.slice(0, i + 1).reduce((a, b) => a + b, 0) * 100).toFixed(2)), borderColor: '#ef4444', pointRadius: 3}]}, options: {plugins: {legend: {display: true}}, scales: {y: {...axT('%'), min: 0, max: 100}}}});
    const lab = gcat ? sub.map(t => groups2(gcat, t)) : null;
    function groups2(g, t){ return groupBy(g).indexOf(g.keys[t]); }
    const gs = gcat ? groupBy(gcat) : [];
    const ds = gcat ? gs.map((g, gi) => ({label: g, data: sc.filter((_, i) => lab[i] === gi).map(p => ({x: p[0], y: p[1]})), backgroundColor: PAL[gi % 10] + '99', pointRadius: 3}))
                    : [{label: '資料', data: sc.map(p => ({x: p[0], y: p[1]})), backgroundColor: '#2563eb88', pointRadius: 3}];
    mk(box(grid, `PCA：PC1 vs PC2${gcat ? '（顏色＝' + gcat.name + '）' : ''}`, 'canvas'), {type: 'scatter', data: {datasets: ds},
      options: {plugins: {legend: {display: !!gcat}}, scales: {x: axT(`PC1 (${(ev[0] * 100).toFixed(1)}%)`), y: axT(`PC2 (${(ev[1] * 100).toFixed(1)}%)`)}}});
    // K-means（以輪廓係數在 k=2~6 間選最佳）
    const rand = rng(42), ss = sample(Z.map((_, i) => i), 300); let best = null;
    for (let kk = 2; kk <= Math.min(6, Math.floor(Z.length / 5)); kk++){
      const r = kmeans(Z, kk, rand), s = silhouette(ss.map(i => Z[i]), ss.map(i => r.lab[i]), kk);
      if (!best || s > best.s) best = {kk, r, s};
    }
    if (!best) return;
    const kds = Array.from({length: best.kk}, (_, c) => ({label: `群 ${c + 1}`, data: sc.filter((_, i) => best.r.lab[i] === c).map(p => ({x: p[0], y: p[1]})), backgroundColor: PAL[c % 10] + 'aa', pointRadius: 3.5}));
    mk(box(grid, `K-means 分群（${best.kk} 群 輪廓係數 ${best.s.toFixed(2)}）`, 'canvas'), {type: 'scatter', data: {datasets: kds}, options: {scales: {x: axT('PC1'), y: axT('PC2')}}});
    const prof = Array.from({length: best.kk}, (_, c) => { const idx = sub.filter((_, i) => best.r.lab[i] === c); return [`群 ${c + 1}`, idx.length, ...v.map(col => fmt(idx.reduce((a, t) => a + col.vec[t], 0) / (idx.length || 1), 2))]; });
    sec.insertAdjacentHTML('beforeend', `<h3 style="margin-top:14px">K-means 各群平均</h3><p class="note">群數由系統在 2–6 群之間自動挑選最適合的</p>${table(['群組', 'N', ...v.map(c => esc(c.name))], prof)}`);
  });

  // 8. 自訂圖表
  run('custom', customSection);
}

function customSection(){
  const {sec, grid} = section('14. 自訂圖表', '自己選圖表類型和 X、Y 軸 選項會依你的資料自動產生');
  const opts = (f) => COLS.map((c, i) => f(c) ? `<option value="${i}">${esc(c.name)}（${typeLabel[c.type]}）</option>` : '').join('');
  const ctr = el('div', 'row');
  ctr.innerHTML = `類型 <select id="cType"><option value="scatter">散佈圖</option><option value="line">折線圖</option><option value="bar">長條圖</option><option value="hist">直方圖</option><option value="pie">圓餅圖</option></select>
    X <select id="cX">${opts(() => true)}</select> Y <select id="cY"><option value="">(無／次數)</option>${opts(c => c.type === 'numeric')}</select>
    顏色分組 <select id="cC"><option value="">(無)</option>${opts(c => c.type === 'categorical' && c.freq.length <= 8)}</select> <span id="cMsg" class="warn"></span>`;
  sec.insertBefore(ctr, grid);
  const cv = box(grid, '自訂圖表', 'canvas', true); let cur = null;
  const draw = () => {
    if (cur){ cur.destroy(); charts = charts.filter(c => c !== cur); cur = null; }
    const type = $('#cType').value, X = COLS[+$('#cX').value], Y = $('#cY').value === '' ? null : COLS[+$('#cY').value], C = $('#cC').value === '' ? null : COLS[+$('#cC').value];
    const msg = t => { $('#cMsg').textContent = t || ''; }; msg('');
    let cfg;
    const rows = ROWS.map((_, t) => t);
    if (type === 'scatter'){
      if (X.type !== 'numeric' || !Y){ return msg('散佈圖要選數值的 X 和數值的 Y'); }
      const gs = C ? C.freq.map(f => f[0]) : [null];
      const ds = gs.map((g, gi) => ({label: g ?? '資料', data: sample(rows.filter(t => (g === null || C.keys[t] === g) && !isNaN(X.vec[t]) && !isNaN(Y.vec[t])), 800).map(t => ({x: X.vec[t], y: Y.vec[t]})), backgroundColor: PAL[gi % 10] + '99', pointRadius: 3}));
      cfg = {type: 'scatter', data: {datasets: ds}, options: {plugins: {legend: {display: !!C}}, scales: {x: axT(X.name), y: axT(Y.name)}}};
    } else if (type === 'line'){
      if (!Y || !(X.type === 'numeric' || X.type === 'date')) return msg('折線圖要選數值或日期的 X 和數值的 Y');
      const key = t => X.type === 'date' ? (X.dvec[t] ? X.dvec[t].getTime() : NaN) : X.vec[t];
      const pts = sample(rows.filter(t => !isNaN(key(t)) && !isNaN(Y.vec[t])).sort((a, b) => key(a) - key(b)), 500);
      cfg = {type: 'line', data: {labels: pts.map(t => X.type === 'date' ? dstr(X.dvec[t]) : fmt(X.vec[t], 2)), datasets: [{label: Y.name, data: pts.map(t => Y.vec[t]), borderColor: PAL[0], pointRadius: pts.length > 80 ? 0 : 3, borderWidth: 1.8}]}, options: {scales: {x: axT(X.name), y: axT(Y.name)}}};
    } else if (type === 'bar' || type === 'pie'){
      if (X.type !== 'categorical') return msg('這種圖的 X 要選類別變數');
      const labels = X.freq.slice(0, 15).map(f => f[0]);
      const val = labels.map(k => { const idx = rows.filter(t => X.keys[t] === k); if (type === 'pie' || !Y) return idx.length; const v = idx.map(t => Y.vec[t]).filter(q => !isNaN(q)); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(4) : 0; });
      cfg = type === 'pie' ? {type: 'pie', data: {labels, datasets: [{data: val, backgroundColor: PAL}]}, options: {plugins: {legend: {position: 'right'}}}}
        : {type: 'bar', data: {labels, datasets: [{label: Y ? `平均 ${Y.name}` : '次數', data: val, backgroundColor: PAL[0]}]}, options: {plugins: {legend: {display: false}}, scales: {x: axT(X.name), y: axT(Y ? `平均 ${Y.name}` : '次數')}}};
    } else {
      if (X.type !== 'numeric') return msg('直方圖的 X 要選數值變數');
      const s = X.st, k = Math.min(30, Math.max(5, Math.ceil(Math.log2(s.n) + 1))), w = (s.max - s.min) / k || 1, bins = Array(k).fill(0);
      s.a.forEach(v => { bins[Math.min(k - 1, Math.floor((v - s.min) / w))]++; });
      cfg = {type: 'bar', data: {labels: bins.map((_, j) => fmt(s.min + (j + .5) * w, 2)), datasets: [{label: '次數', data: bins, backgroundColor: PAL[0], barPercentage: 1, categoryPercentage: 1}]}, options: {plugins: {legend: {display: false}}, scales: {x: axT(X.name), y: axT('次數')}}};
    }
    $('h4', cv.closest('.gc')).textContent = `自訂圖表：${type} ${X.name}${Y ? ' × ' + Y.name : ''}`;
    cur = mk(cv, cfg);
  };
  ['#cType', '#cX', '#cY', '#cC'].forEach(s => $(s).addEventListener('change', draw));
  const firstNum = COLS.findIndex(c => c.type === 'numeric'); if (firstNum >= 0) $('#cX').value = firstNum;
  const secondNum = COLS.findIndex((c, i) => c.type === 'numeric' && i !== firstNum); if (secondNum >= 0) $('#cY').value = secondNum;
  draw();
}

/* ---------- 範例資料 ---------- */
function randn(){ return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()); }
function sampleData(){
  const rows = [], regions = ['北區','中區','南區','東區'], base = new Date('2025-01-01');
  for (let i = 0; i < 400; i++){
    const age = Math.max(18, Math.round(38 + randn() * 11)), male = Math.random() < .5;
    const h = Math.round((male ? 172 : 160) + randn() * 6), w = Math.round(((male ? 70 : 55) + (h - 166) * .6 + randn() * 7) * 10) / 10;
    const d = new Date(base.getTime() + i * 86400000), wd = d.getUTCDay();
    const spend = Math.max(0, Math.round(800 + age * 14 + i * 1.2 + (wd === 0 || wd === 6 ? 300 : 0) + randn() * 250 + (Math.random() < .03 ? 2500 : 0)));
    const sat = Math.min(5, Math.max(1, Math.round(3.4 + spend / 3500 + randn() * .7)));
    rows.push({'日期': dstr(d), '性別': male ? '男' : '女', '地區': regions[Math.floor(Math.random() * 4)], '年齡': age, '身高': h,
      '體重': Math.random() < .04 ? '' : w, '消費金額': spend, '滿意度': sat});
  }
  fileName = '範例資料'; $('#fname').textContent = '已載入範例資料'; setData(rows);
}

/* ---------- 7. 事件 ---------- */
function showTab(t){
  curTab = t;
  ['upload', 'stats', 'viz'].forEach(k => { $('#' + k).style.display = k === t ? '' : 'none'; $('#tab-' + k).classList.toggle('active', k === t); });
  $('#filterPanel').hidden = !(RAW.length && t !== 'upload');
  if (t === 'stats' && !statsDone){ renderStats(); statsDone = true; }
  if (t === 'viz' && !vizDone){ renderViz(); vizDone = true; }
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => !b.disabled && showTab(b.dataset.tab)));
const drop = $('#drop'), fi = $('#file');
drop.addEventListener('click', () => fi.click());
fi.addEventListener('change', () => handleFile(fi.files[0]));
['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', ev => handleFile(ev.dataTransfer.files[0]));
$('#sheet').addEventListener('change', loadSheet);
$('#sample').addEventListener('click', sampleData);
$('#applyFilter').addEventListener('click', () => { collectFilters(); applyFilters(); });
$('#resetFilter').addEventListener('click', resetFilters);
$('#fpToggle').addEventListener('click', () => { const b = $('#fpBody'); b.hidden = !b.hidden; $('#fpToggle').textContent = b.hidden ? '展開' : '收合'; });
const setVars = f => { document.querySelectorAll('#varList input').forEach(i => { i.checked = f(META[+i.dataset.v]); }); };
$('#varAll').addEventListener('click', () => setVars(() => true));
$('#varNone').addEventListener('click', () => setVars(() => false));
$('#varNum').addEventListener('click', () => setVars(m => m.type === 'numeric'));
$('#varCat').addEventListener('click', () => setVars(m => m.type === 'categorical'));
$('#filterGrid').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const w = b.closest('.fw'); w.querySelectorAll('input[data-o]').forEach(i => { i.checked = b.hasAttribute('data-all'); });
});
document.addEventListener('click', e => { const b = e.target.closest('.dl'); if (b) downloadCard(b.closest('.gc')); });
