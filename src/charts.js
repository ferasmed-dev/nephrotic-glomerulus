// Dependency-free SVG charts: line chart, 100 % stacked area and a grouped
// bar chart on a log scale. All draw a legend, hover tooltips and a table view.

// Chart geometry follows the container width so text stays at its real size.
let W = 640, H = 250, M = { t: 30, r: 112, b: 38, l: 48 }, iw = 0, ih = 0, narrow = false;
function setDims(el) {
  const cw = el.clientWidth || 640;
  W = Math.round(Math.min(Math.max(cw, 300), 820));
  narrow = W < 520;
  H = narrow ? 230 : 250;
  M = { t: 30, r: narrow ? 14 : 112, b: 38, l: 44 };
  iw = W - M.l - M.r;
  ih = H - M.t - M.b;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function niceTicks(min, max, n = 5) {
  const span = max - min || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function legendHtml(series) {
  return `<div class="legend" role="list">${series.map((s) => `<span role="listitem" class="lg"><i style="background:${s.color}${s.dash ? ';background:repeating-linear-gradient(90deg,' + s.color + ' 0 5px,transparent 5px 8px)' : ''}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}

function tableHtml(o, x, series, fmtX, fmtY, summary) {
  const step = Math.max(1, Math.ceil(x.length / 25));
  let rows = '';
  for (let i = 0; i < x.length; i += step) {
    rows += `<tr><th scope="row">${esc(fmtX(x[i]))}</th>${series.map((s) => `<td>${esc(fmtY(s.values[i]))}</td>`).join('')}</tr>`;
  }
  return `<details class="tbl"><summary>${esc(summary)}</summary><div class="tblwrap"><table><thead><tr><th>${esc(o.xLabel || '')}</th>${series.map((s) => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

function attachHover(el, o, x, sx, series, fmtX, fmtY, valueAt) {
  const Wc = W, Hc = H, Mt = M.t;
  const svg = el.querySelector('svg');
  const tip = el.querySelector('.tip');
  const cross = svg.querySelector('.cross');
  const hit = svg.querySelector('.hit');
  const show = (evt) => {
    const r = svg.getBoundingClientRect();
    const px = ((evt.clientX - r.left) / r.width) * Wc;
    let best = 0, bd = Infinity;
    for (let i = 0; i < x.length; i++) {
      const d = Math.abs(sx(x[i]) - px);
      if (d < bd) { bd = d; best = i; }
    }
    const cx = sx(x[best]);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx);
    cross.style.display = '';
    tip.innerHTML = `<b>${esc(fmtX(x[best]))}</b>` + series.map((s) => `<div><i style="background:${s.color}"></i>${esc(s.name)}: <b>${esc(fmtY(valueAt(s, best)))}</b></div>`).join('');
    tip.style.display = 'block';
    const left = (cx / Wc) * r.width;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(r.width - tw, left + 12 > r.width - tw ? left - tw - 12 : left + 12))}px`;
    tip.style.top = `${(Mt / Hc) * r.height + 4}px`;
  };
  const hide = () => { tip.style.display = 'none'; cross.style.display = 'none'; };
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', hide);
}

function axes(o, x0, x1, y0, y1, sx, sy, fmtX, fmtY) {
  let s = '';
  for (const t of niceTicks(y0, y1, 5)) {
    s += `<line class="grid" x1="${M.l}" x2="${M.l + iw}" y1="${sy(t)}" y2="${sy(t)}"/>`;
    s += `<text class="tick" x="${M.l - 6}" y="${sy(t) + 4}" text-anchor="end">${esc(fmtY(t, true))}</text>`;
  }
  for (const t of niceTicks(x0, x1, narrow ? 5 : 7)) {
    s += `<text class="tick" x="${sx(t)}" y="${M.t + ih + 16}" text-anchor="middle">${esc(fmtX(t, true))}</text>`;
  }
  s += `<line class="axis" x1="${M.l}" x2="${M.l + iw}" y1="${M.t + ih}" y2="${M.t + ih}"/>`;
  if (o.xLabel) s += `<text class="alabel" x="${M.l + iw / 2}" y="${H - 4}" text-anchor="middle">${esc(o.xLabel)}</text>`;
  return s;
}

function markers(o, sx, sy) {
  let s = '';
  for (const h of o.hlines || []) {
    s += `<line class="hline" x1="${M.l}" x2="${M.l + iw}" y1="${sy(h.y)}" y2="${sy(h.y)}"/>`;
    s += `<text class="mlabel" x="${M.l + iw - 4}" y="${sy(h.y) - 4}" text-anchor="end">${esc(h.label)}</text>`;
  }
  (o.markers || []).forEach((m, i) => {
    const x = sx(m.x);
    s += `<line class="${m.cls || 'vline'}" x1="${x}" x2="${x}" y1="${M.t}" y2="${M.t + ih}"/>`;
    s += `<line class="${m.cls || 'vline'}" x1="${x}" x2="${x}" y1="${M.t - 14 + (i % 2) * 11}" y2="${M.t}" stroke-dasharray="1 2"/>`;
    s += `<text class="mlabel" x="${x + 3}" y="${M.t - 18 + (i % 2) * 11}">${esc(m.label)}</text>`;
  });
  return s;
}

/**
 * o: { title, x[], series[{name, values[], color, dash}], yMin, yMax,
 *      xLabel, yLabel, markers[{x,label,cls}], hlines[{y,label}],
 *      fmtX(v,tick), fmtY(v,tick), tableSummary }
 */
export function lineChart(el, o) {
  setDims(el);
  const x = o.x;
  const x0 = x[0], x1 = x[x.length - 1];
  const y0 = o.yMin ?? 0;
  const y1 = o.yMax ?? Math.max(...o.series.flatMap((s) => s.values)) * 1.1;
  const ml = M.l, mt = M.t, iwc = iw, ihc = ih;
  const sx = (v) => ml + ((v - x0) / (x1 - x0 || 1)) * iwc;
  const sy = (v) => mt + ihc - ((Math.min(Math.max(v, y0), y1) - y0) / (y1 - y0 || 1)) * ihc;
  const fmtX = o.fmtX || ((v) => v), fmtY = o.fmtY || ((v) => v);
  let s = axes(o, x0, x1, y0, y1, sx, sy, fmtX, fmtY);
  s += markers(o, sx, sy);
  for (const ser of o.series) {
    const d = ser.values.map((v, i) => `${i ? 'L' : 'M'}${sx(x[i]).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');
    s += `<path d="${d}" fill="none" stroke="${ser.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${ser.dash ? ' stroke-dasharray="6 4"' : ''}/>`;
  }
  // direct labels (<= 4 series), nudged apart
  if (o.series.length <= 4 && !narrow) {
    const labs = o.series.map((ser) => ({ ser, y: sy(ser.values[ser.values.length - 1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 13) labs[i].y = labs[i - 1].y + 13;
    for (const l of labs) s += `<text class="dlabel" x="${M.l + iw + 6}" y="${l.y + 4}">${esc(l.ser.name)}</text>`;
  }
  if (o.cursor != null) {
    s += `<line class="cursor" x1="${sx(o.cursor)}" x2="${sx(o.cursor)}" y1="${M.t}" y2="${M.t + ih}"/>`;
    for (const ser of o.series) {
      const i = x.findIndex((v) => v >= o.cursor);
      if (i >= 0) s += `<circle cx="${sx(x[i])}" cy="${sy(ser.values[i])}" r="4.5" fill="${ser.color}" stroke="var(--surface)" stroke-width="2"/>`;
    }
  }
  s += `<line class="cross" y1="${M.t}" y2="${M.t + ih}" style="display:none"/>`;
  s += `<rect class="hit" x="${M.l}" y="${M.t}" width="${iw}" height="${ih}" fill="transparent"/>`;
  el.innerHTML = `${o.title ? `<h4 class="ctitle">${esc(o.title)}</h4>` : ''}${legendHtml(o.series)}${o.yLabel ? `<div class="ylabel">${esc(o.yLabel)}</div>` : ''}<div class="chartbox"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || '')}">${s}</svg><div class="tip" role="status"></div></div>${tableHtml(o, x, o.series, fmtX, fmtY, o.tableSummary || 'Table')}`;
  attachHover(el, o, x, sx, o.series, fmtX, fmtY, (ser, i) => ser.values[i]);
}

/** 100 % stacked area. Series are stacked bottom-up in the given order. */
export function stackedArea(el, o) {
  setDims(el);
  const x = o.x;
  const x0 = x[0], x1 = x[x.length - 1];
  const ml = M.l, mt = M.t, iwc = iw, ihc = ih;
  const sx = (v) => ml + ((v - x0) / (x1 - x0 || 1)) * iwc;
  const sy = (v) => mt + ihc - (Math.min(Math.max(v, 0), 100) / 100) * ihc;
  const fmtX = o.fmtX || ((v) => v), fmtY = o.fmtY || ((v) => v);
  let s = axes(o, x0, x1, 0, 100, sx, sy, fmtX, fmtY);
  const base = new Array(x.length).fill(0);
  for (const ser of o.series) {
    const top = ser.values.map((v, i) => base[i] + v);
    const up = top.map((v, i) => `${sx(x[i]).toFixed(1)} ${sy(v).toFixed(1)}`);
    const down = base.map((v, i) => `${sx(x[i]).toFixed(1)} ${sy(v).toFixed(1)}`).reverse();
    s += `<path d="M${up.join(' L')} L${down.join(' L')} Z" fill="${ser.color}" stroke="var(--surface)" stroke-width="2" stroke-linejoin="round"/>`;
    for (let i = 0; i < x.length; i++) base[i] = top[i];
  }
  s += markers(o, sx, sy);
  // direct labels at the right edge, centred in each band
  let acc = 0;
  const labs = o.series.map((ser) => {
    const v = ser.values[ser.values.length - 1];
    const y = sy(acc + v / 2);
    acc += v;
    return { ser, y, v };
  }).filter((l) => l.v > 2).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 13) labs[i].y = labs[i - 1].y + 13;
  if (!narrow) for (const l of labs) s += `<text class="dlabel" x="${M.l + iw + 6}" y="${l.y + 4}">${esc(l.ser.short || l.ser.name)}</text>`;
  if (o.cursor != null) s += `<line class="cursor" x1="${sx(o.cursor)}" x2="${sx(o.cursor)}" y1="${M.t}" y2="${M.t + ih}"/>`;
  s += `<line class="cross" y1="${M.t}" y2="${M.t + ih}" style="display:none"/>`;
  s += `<rect class="hit" x="${M.l}" y="${M.t}" width="${iw}" height="${ih}" fill="transparent"/>`;
  el.innerHTML = `${o.title ? `<h4 class="ctitle">${esc(o.title)}</h4>` : ''}${legendHtml(o.series)}${o.yLabel ? `<div class="ylabel">${esc(o.yLabel)}</div>` : ''}<div class="chartbox"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || '')}">${s}</svg><div class="tip" role="status"></div></div>${tableHtml(o, x, o.series, fmtX, fmtY, o.tableSummary || 'Table')}`;
  attachHover(el, o, x, sx, o.series, fmtX, fmtY, (ser, i) => ser.values[i]);
}

/**
 * Grouped bars on a log10 scale (values > 0).
 * o: { title, categories[], series[{name, color, values[]}], yMin, yMax, yLabel,
 *      fmtY(v), fmtCat(c), tableSummary }
 */
export function barChartLog(el, o) {
  setDims(el);
  const ml = M.l + 6, mt = M.t, iwc = W - ml - (narrow ? 14 : 24), ihc = ih;
  const y0 = Math.log10(o.yMin), y1 = Math.log10(o.yMax);
  const sy = (v) => mt + ihc - ((Math.min(Math.max(Math.log10(Math.max(v, o.yMin)), y0), y1) - y0) / (y1 - y0)) * ihc;
  const fmtY = o.fmtY || ((v) => v), fmtCat = o.fmtCat || ((c) => c);
  const nC = o.categories.length, nS = o.series.length;
  const band = iwc / nC;
  const bw = Math.min(34, (band * 0.7) / nS);
  let s = '';
  for (let e = Math.ceil(y0); e <= y1; e++) {
    const y = sy(10 ** e);
    s += `<line class="grid" x1="${ml}" x2="${ml + iwc}" y1="${y}" y2="${y}"/>`;
    s += `<text class="tick" x="${ml - 6}" y="${y + 4}" text-anchor="end">10${e < 0 ? '⁻' : ''}${String(Math.abs(e)).split('').map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]).join('')}</text>`;
  }
  s += `<line class="axis" x1="${ml}" x2="${ml + iwc}" y1="${mt + ihc}" y2="${mt + ihc}"/>`;
  o.categories.forEach((c, i) => {
    const cx = ml + band * (i + 0.5);
    s += `<text class="tick" x="${cx}" y="${mt + ihc + 16}" text-anchor="middle">${esc(fmtCat(c))}</text>`;
    o.series.forEach((ser, k) => {
      const x = cx - (nS * bw) / 2 + k * bw + 1;
      const y = sy(ser.values[i]);
      const h = mt + ihc - y;
      const r = Math.min(4, h / 2, (bw - 2) / 2);
      s += `<path d="M${x} ${mt + ihc} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + bw - 2 - r} Q${x + bw - 2} ${y} ${x + bw - 2} ${y + r} V${mt + ihc} Z" fill="${ser.color}"/>`;
    });
    s += `<rect class="bhit" data-i="${i}" x="${cx - band / 2}" y="${mt}" width="${band}" height="${ihc}" fill="transparent"/>`;
  });
  const rows = o.categories.map((c, i) => `<tr><th scope="row">${esc(fmtCat(c))}</th>${o.series.map((ser) => `<td>${esc(fmtY(ser.values[i]))}</td>`).join('')}</tr>`).join('');
  const table = `<details class="tbl"><summary>${esc(o.tableSummary || 'Table')}</summary><div class="tblwrap"><table><thead><tr><th></th>${o.series.map((ser) => `<th>${esc(ser.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></details>`;
  el.innerHTML = `${o.title ? `<h4 class="ctitle">${esc(o.title)}</h4>` : ''}${legendHtml(o.series)}${o.yLabel ? `<div class="ylabel">${esc(o.yLabel)}</div>` : ''}<div class="chartbox"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || '')}">${s}</svg><div class="tip" role="status"></div></div>${table}`;
  const svg = el.querySelector('svg');
  const tip = el.querySelector('.tip');
  const Wc = W, Hc = H;
  svg.querySelectorAll('.bhit').forEach((r) => {
    const show = () => {
      const i = Number(r.dataset.i);
      tip.innerHTML = `<b>${esc(fmtCat(o.categories[i]))}</b>` + o.series.map((ser) => `<div><i style="background:${ser.color}"></i>${esc(ser.name)}: <b>${esc(fmtY(ser.values[i]))}</b></div>`).join('');
      tip.style.display = 'block';
      const rect = svg.getBoundingClientRect();
      const left = ((ml + band * (i + 0.5)) / Wc) * rect.width;
      tip.style.left = `${Math.max(0, Math.min(rect.width - tip.offsetWidth, left + 10))}px`;
      tip.style.top = `${(mt / Hc) * rect.height}px`;
    };
    r.addEventListener('pointerenter', show);
    r.addEventListener('pointerdown', show);
    r.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
  });
}
