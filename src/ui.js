import * as M from './model.js';
import { STRINGS, LANGS, pickLang } from './i18n.js';
import { renderGlomerulus, renderIF, layersOf, swatchFor, ANAT } from './glomerulus.js';
import { renderBarrier, startParticles, PCOLOR } from './barrier.js';
import { mount3d } from './view3d.js';
import { lineChart, barChartLog } from './charts.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let lang = pickLang(location.search, store.get('ngn-lang'), navigator.language);
let S = STRINGS[lang];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const VIEWS = ['glom', 'barrier', '3d'];
const PODO_IDS = ['mcd', 'fsgsPrimary', 'fsgsGenetic', 'fsgsAdaptive'];
const CAT = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

const state = {
  mode: 'explore',
  entity: 'mcd',
  sc: M.defaultScenario('mcd'),
  view: 'glom',
  showPodo: true,
  cmp: { a: 'mcd', b: 'fsgsPrimary', onlyDiff: false },
  quiz: { seed: null, n: 1, choice: null, ok: 0, total: 0 },
  onlyAbnormal: false,
  highlight: null,
  step: null,
};
let stepTimer = null, timeTimer = null, particles = null, viewer = null, particlesPaused = false;

const course = (id) => M.ENTITIES[id].course;
const isPodo = (id) => course(id) === 'steroids' || course(id) === 'raas';
const hasStage = (id) => !!M.ENTITIES[id].visual.subepi;

function applyPreset(p) {
  state.mode = p.mode;
  if (p.mode === 'explore') {
    state.entity = p.entity;
    state.sc = { ...M.defaultScenario(p.entity) };
    for (const k of ['week', 'month', 'txMonth', 'noTx', 'stage', 'pla2r0']) if (p[k] != null) state.sc[k] = p[k];
    state.view = p.view || 'glom';
  } else if (p.mode === 'compare') {
    state.cmp.a = p.a; state.cmp.b = p.b;
  }
}

function readUrl() {
  const q = new URLSearchParams(location.search);
  const preset = q.get('preset');
  if (preset && M.PRESETS[preset]) applyPreset(M.PRESETS[preset]);
  const mode = q.get('mode');
  if (['explore', 'compare', 'quiz'].includes(mode)) state.mode = mode;
  const ent = q.get('entity');
  if (M.ENTITIES[ent] && ent !== state.entity) { state.entity = ent; state.sc = M.defaultScenario(ent); }
  if (VIEWS.includes(q.get('view'))) state.view = q.get('view');
  const num = (k) => { const v = Number(q.get(k)); return q.get(k) != null && Number.isFinite(v) ? v : null; };
  const id = state.entity;
  if (isPodo(id) && num('week') != null) state.sc.week = M.clamp(num('week'), 0, M.PODO.weeks);
  if (course(id) === 'mn') {
    if (num('month') != null) state.sc.month = M.clamp(num('month'), 0, M.MN.months);
    if (q.get('tx') === 'none') state.sc.noTx = true;
    else if (num('tx') != null) { state.sc.txMonth = M.clamp(num('tx'), 0, 12); state.sc.noTx = false; }
    if (num('pla2r') != null) state.sc.pla2r0 = M.clamp(num('pla2r'), M.MN_PLA2R0.min, M.MN_PLA2R0.max);
  }
  if (hasStage(id) && num('stage') != null) state.sc.stage = M.clamp(Math.round(num('stage')), 1, 4);
  if (q.get('podo') === '0') state.showPodo = false;
  if (M.ENTITIES[q.get('a')]) state.cmp.a = q.get('a');
  if (M.ENTITIES[q.get('b')]) state.cmp.b = q.get('b');
  if (q.get('only') === '1') state.cmp.onlyDiff = true;
  if (num('case') != null) state.quiz.seed = Math.abs(Math.round(num('case')));
}

function writeUrl() {
  const q = new URLSearchParams();
  q.set('lang', lang);
  q.set('mode', state.mode);
  if (state.mode === 'explore') {
    const id = state.entity;
    q.set('entity', id);
    if (state.view !== 'glom') q.set('view', state.view);
    if (isPodo(id)) q.set('week', String(state.sc.week));
    if (course(id) === 'mn') {
      q.set('month', String(state.sc.month));
      q.set('tx', state.sc.noTx ? 'none' : String(state.sc.txMonth));
      if (state.sc.pla2r0 !== M.MN_PLA2R0.default) q.set('pla2r', String(state.sc.pla2r0));
    }
    if (hasStage(id)) q.set('stage', String(state.sc.stage));
    if (state.view === '3d' && !state.showPodo) q.set('podo', '0');
  } else if (state.mode === 'compare') {
    q.set('a', state.cmp.a); q.set('b', state.cmp.b);
    if (state.cmp.onlyDiff) q.set('only', '1');
  } else if (state.quiz.seed != null) {
    q.set('case', String(state.quiz.seed));
  }
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const nf = (v, d = 0) => new Intl.NumberFormat(S.locale, { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);

function digits(p, v) {
  if (p.kind === 'index' || p.kind === 'sel') return p.kind === 'sel' ? 2 : 1;
  if (['upcr', 'albumin', 'hba1c'].includes(p.key)) return v < 1 && p.key === 'upcr' ? 2 : 1;
  if (p.key === 'pla2r') return v < 10 ? 1 : 0;
  return 0;
}

const QUAL_PRESENCE = new Set(['lipiduria']);

function valueText(p, v) {
  if (p.kind === 'qual') {
    const pos = v >= 0.5;
    return QUAL_PRESENCE.has(p.key) ? (pos ? S.present : S.absent) : (pos ? S.status.pos : S.status.neg);
  }
  if (p.kind === 'ord') return ['0', '+', '++', '+++'][Math.round(M.clamp(v, 0, 3))];
  if (p.kind === 'index') return `${nf(v, 1)} (${S.indexUnit})`;
  if (p.kind === 'sel') return nf(v, 2);
  return `${nf(v, digits(p, v))} ${S.units[p.key] || ''}`.trim();
}

function markOf(p, age) {
  if (p.key === 'upcr') return M.nephroticCut(age);
  if (p.kind === 'sel') return 0.2;
  return p.mark ?? null;
}

function normalText(p, age) {
  if (p.kind === 'qual') return QUAL_PRESENCE.has(p.key) ? S.absent : S.status.neg;
  if (p.kind === 'ord') return '0';
  if (p.kind === 'index') return '< 1';
  if (p.kind === 'sel') return `≤ ${nf(0.1, 1)} (${S.status.sel.toLowerCase()})`;
  const { lo, hi } = M.normalRange(p.key, age);
  const u = S.units[p.key] || '';
  const d = ['upcr', 'albumin', 'hba1c'].includes(p.key) ? (p.key === 'upcr' ? 2 : 1) : 0;
  if (hi === Infinity) return `≥ ${nf(lo, d)} ${u}`;
  if (p.key === 'hematuria') return `≤ ${nf(hi)} ${u}`;
  if (lo === 0) return `< ${nf(p.key === 'pla2r' ? 14 : hi, d)} ${u}`;
  return `${nf(lo, d)}–${nf(hi, d)} ${u}`;
}

function markNote(p, age) {
  const m = markOf(p, age);
  if (m == null || !S.marks[p.key]) return '';
  return ` · ┆ ${S.marks[p.key]} ${p.key === 'albumin' ? '<' : p.key === 'upcr' ? '≥' : '>'} ${nf(m, p.key === 'pla2r' ? 0 : 1)}`;
}

const ARROW = { low: '↓', high: '↑', pos: '+', normal: '', neg: '', sel: '', mid: '↑', nonsel: '↑' };
const STATUS_COLOR = { low: 'var(--lo)', high: 'var(--hi)', pos: 'var(--hi)', normal: 'var(--ink-2)', neg: 'var(--ink-3)', sel: 'var(--ink-2)', mid: 'var(--hi)', nonsel: 'var(--hi)' };

function badge(st, p = null) {
  let txt = S.status[st];
  if (p && QUAL_PRESENCE.has(p.key)) txt = st === 'pos' ? S.present : S.absent;
  const cls = { mid: 'high', nonsel: 'high', sel: 'normal' }[st] || st;
  return `<span class="st st-${cls}">${ARROW[st] ? `<b aria-hidden="true">${ARROW[st]}</b> ` : ''}${esc(txt)}</span>`;
}

function barSvg(p, v, age) {
  const W = 200, x0 = 6, x1 = 194;
  if (p.kind === 'qual') return '';
  const st = M.status(p.key, v, age);
  if (p.kind === 'ord') {
    let s = '';
    for (let i = 0; i < 3; i++) s += `<rect x="${x0 + i * 22}" y="2" width="18" height="14" rx="4" fill="${i < Math.round(v) ? STATUS_COLOR[st] : 'var(--track)'}"/>`;
    return `<svg class="bar" viewBox="0 0 ${W} 18" aria-hidden="true">${s}</svg>`;
  }
  let min, max, lo, hi;
  if (p.kind === 'index') { min = 0; max = M.INDEX_MAX; lo = 0; hi = 1; } else {
    min = p.min; max = p.max;
    const r = M.normalRange(p.key, age);
    lo = Math.max(r.lo, min); hi = Math.min(r.hi, max);
  }
  const sx = (x) => x0 + ((M.clamp(x, min, max) - min) / (max - min)) * (x1 - x0);
  let s = `<line x1="${x0}" x2="${x1}" y1="9" y2="9" stroke="var(--track)" stroke-width="2" stroke-linecap="round"/>`;
  s += `<rect x="${sx(lo)}" y="4" width="${Math.max(2, sx(hi) - sx(lo))}" height="10" rx="3" fill="var(--band)"/>`;
  if (p.kind === 'index') s += `<line x1="${sx(1)}" x2="${sx(1)}" y1="1" y2="17" stroke="var(--ink-3)" stroke-width="1"/>`;
  const mk = markOf(p, age);
  if (mk != null) s += `<line x1="${sx(mk)}" x2="${sx(mk)}" y1="1" y2="17" stroke="var(--ink-3)" stroke-width="1" stroke-dasharray="2 2"/>`;
  s += `<circle cx="${sx(v)}" cy="9" r="5.5" fill="${STATUS_COLOR[st]}" stroke="var(--surface)" stroke-width="2"/>`;
  return `<svg class="bar" viewBox="0 0 ${W} 18" aria-hidden="true">${s}</svg>`;
}

function renderLabs(labs, age, { onlyAbnormal = false } = {}) {
  let html = '';
  for (const g of M.PARAM_GROUPS) {
    const rows = M.PARAMS.filter((p) => p.group === g).filter((p) => !onlyAbnormal || M.isAbnormal(p.key, labs[p.key], age));
    if (!rows.length) continue;
    html += `<div class="lgroup"><h4>${esc(S.paramGroups[g])}</h4>`;
    for (const p of rows) {
      const v = labs[p.key];
      const st = M.status(p.key, v, age);
      const abn = M.isAbnormal(p.key, v, age);
      html += `<div class="lrow${abn ? ' abn' : ''}" data-param="${p.key}" data-status="${st}">` +
        `<span class="lname">${esc(S.params[p.key])}</span>` +
        `<span class="lbar" title="${esc(S.normalIs(normalText(p, age)) + markNote(p, age))}">${barSvg(p, v, age)}</span>` +
        `<span class="lval">${p.kind === 'qual' ? '' : esc(valueText(p, v))}</span>${badge(st, p)}` +
        `<span class="lnorm">${esc(S.normalIs(normalText(p, age)) + markNote(p, age))}</span></div>`;
    }
    html += '</div>';
  }
  return html;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
function treeHtml({ answer = false } = {}) {
  let html = `<h3>${esc(S.tree)}</h3><div class="troot">${esc(S.treeRoot)}</div>`;
  for (const b of M.TREE) {
    html += `<div class="tbranch"><div class="tgroup">${esc(S.groups[b.group])}</div><div class="tents">`;
    for (const id of b.ids) {
      let cls = '', pressed = '';
      if (answer) {
        if (state.quiz.choice) {
          if (id === currentCase().entity) cls = ' right';
          else if (id === state.quiz.choice) cls = ' wrong';
        }
      } else pressed = ` aria-pressed="${id === state.entity}"`;
      html += `<button type="button" class="ent${cls}" data-ent="${id}"${pressed}${answer && state.quiz.choice ? ' disabled' : ''}>${esc(S.entities[id].short)}</button>`;
    }
    html += '</div></div>';
  }
  html += `<p class="tnote">${esc(S.treeNote)}</p>`;
  return html;
}

function chipsHtml(id) {
  const e = M.ENTITIES[id];
  return `<span class="chip">${esc(S.groups[e.group])}</span><span class="chip">${esc(S.ageGroups[e.clinical.age])}</span>`;
}

function reactantsHtml(id) {
  const r = M.ENTITIES[id].if.reactants;
  return Object.entries(r).map(([k, n]) => `<span class="chip chip-if">${esc(k === 'Alb.' ? (lang === 'es' ? 'Albúmina' : 'Albumin') : k)} ${n ? '+'.repeat(n) : '−'}</span>`).join('');
}

function glomSvg(id, prefix, stage = state.sc.stage || 2) {
  return renderGlomerulus(M.ENTITIES[id], { titles: S.layers, stage, idPrefix: prefix, label: `${S.glomerulus}: ${S.entities[id].name}` });
}

function ifBox(id, prefix) {
  const e = M.ENTITIES[id];
  const title = e.if.pattern === 'congo' ? S.congoTitle : S.ifTitle;
  return `<div class="ifbox">${renderIF(e.if.pattern, { idPrefix: prefix, label: `${title}: ${S.ifPatterns[e.if.pattern]}` })}<div><h4>${esc(title)}</h4><p>${esc(S.ifPatterns[e.if.pattern])}</p><div class="chips">${reactantsHtml(id)}</div></div></div>`;
}

const scOf = (id) => (id === state.entity ? state.sc : M.defaultScenario(id));
const currentLabs = () => (state.mode === 'quiz' ? currentCase().labs : M.labsFor(state.entity, state.sc));

// ---------------------------------------------------------------------------
// Explore
// ---------------------------------------------------------------------------
function stopAnimations() {
  particles?.stop(); particles = null;
  viewer?.destroy(); viewer = null;
}

function renderExploreShell() {
  const id = state.entity;
  const e = M.ENTITIES[id];
  const T = S.entities[id];
  const signs = e.clinical.signs.length ? e.clinical.signs.map((sg) => `<span class="chip chip-sign">${esc(S.signs[sg])}</span>`).join('') : `<span class="small">${esc(S.noSigns)}</span>`;
  const viewTabs = VIEWS.map((v) => `<button type="button" role="tab" class="vtab" data-view="${v}" aria-selected="${v === state.view}">${esc(S.views[v])}</button>`).join('');
  const stage = hasStage(id)
    ? `<label class="slider stage"><span>${esc(S.stageLabel)}: <output id="stageOut"></output></span><input type="range" id="stage" min="1" max="4" step="1"></label>`
    : '';
  let side = `<h4 class="first">${esc(S.whoTitle)}</h4><p>${esc(T.who)}</p>`;
  side += `<h4>${esc(S.biopsyTitle)}</h4><p>${esc(S.keys.biopsy[e.keys.biopsy])}</p>`;
  side += ifBox(id, 'ifx');
  side += `<h4>${esc(S.lmTitle)}</h4><p>${esc(T.lm)}</p><h4>${esc(S.emTitle)}</h4><p>${esc(T.em)}</p>`;
  if (course(id) === 'mn') side += '<div id="riskCard" class="riskcard"></div>';
  side += `<h4>${esc(S.txTitle)}</h4><p>${esc(T.tx)}</p><h4>${esc(S.progTitle)}</h4><p>${esc(T.prog)}</p>`;

  let time;
  if (isPodo(id)) {
    time = `<div class="controls">
      <label class="slider"><span>${esc(S.weekLabel)}: <output id="tOut"></output></span><input type="range" id="tSlider" min="0" max="${M.PODO.weeks}" step="0.5"></label>
      <button type="button" class="btn" id="tplay">${esc(S.play)}</button></div>
      <p class="note">${esc(S.therapy[M.PODO[id].therapy])}</p>`;
  } else if (course(id) === 'mn') {
    time = `<div class="controls">
      <label class="slider"><span>${esc(S.monthLabel)}: <output id="tOut"></output></span><input type="range" id="tSlider" min="0" max="${M.MN.months}" step="0.5"></label>
      <label class="slider"><span>${esc(S.txMonthLabel)}: <output id="txOut"></output></span><input type="range" id="tx" min="0" max="12" step="0.5"></label>
      <label class="slider"><span>${esc(S.pla2r0Label)}: <output id="p0Out"></output></span><input type="range" id="p0" min="${M.MN_PLA2R0.min}" max="${M.MN_PLA2R0.max}" step="5"></label>
      <label class="check"><input type="checkbox" id="notx"> ${esc(S.noTx)}</label>
      <button type="button" class="btn" id="tplay">${esc(S.play)}</button></div>`;
  }
  const timeCard = time
    ? `<section class="card a-time"><h3>${esc(S.timeTitle)} <span class="tag" title="${esc(S.footerModel)}">${esc(S.modelTag)}</span></h3>${time}<p class="live" id="live" aria-live="polite"></p><p class="note" id="tnote"></p><div class="charts" id="charts"></div></section>`
    : `<section class="card a-time"><h3>${esc(S.timeTitle)}</h3><p class="note">${esc(S.noTimeModel)}</p></section>`;

  $('#app').innerHTML = `<div class="g-explore">
    <aside class="card a-tree" id="tree">${treeHtml()}</aside>
    <section class="card a-glom"><h2 id="entName" tabindex="-1">${esc(T.name)}</h2><div class="chips">${chipsHtml(id)}</div>
      <div class="signs"><span class="muted small">${esc(S.signsTitle)}:</span> ${signs}</div>
      <div class="viewbar"><div class="vtabs" role="tablist" aria-label="${esc(S.viewLabel)}">${viewTabs}</div>${stage}</div>
      <div id="view"></div><div id="viewExtra"></div></section>
    <section class="card a-steps"><div class="rowhead"><h3>${esc(S.pathogenesis)}</h3><div><button type="button" class="btn" id="splay">${esc(S.play)}</button> <button type="button" class="btn ghost" id="sall">${esc(S.allLayers)}</button></div></div><ol class="steps" id="steps"></ol></section>
    <section class="card a-side">${side}</section>
    <section class="card a-casc"><h3>${esc(S.cascadeTitle)}</h3><p class="note">${esc(S.cascadeHow)}</p><ul class="casc" id="casc"></ul><p class="verdict" id="verdict"></p></section>
    <section class="card a-sieve"><h3>${esc(S.sieveTitle)} <span class="tag" title="${esc(S.footerModel)}">${esc(S.modelTag)}</span></h3><div class="chart" id="sieveChart"></div><p class="si" id="si"></p><p class="note">${esc(S.siNote)}</p><h4>${esc(S.compTitle)}</h4><div id="comp"></div><p class="note">${esc(S.tubularNote)}</p></section>
    ${timeCard}
    <section class="card a-labs"><div class="rowhead"><h3>${esc(S.labsTitle)}</h3><label class="check"><input type="checkbox" id="onlyAbn"> ${esc(S.onlyAbnormal)}</label></div><p class="note">${esc(S.labsNote)}</p><div id="labs" class="labs"></div></section>
  </div>`;

  $('#steps').innerHTML = T.steps.map(([layer, txt], i) => `<li><button type="button" class="stepbtn" data-i="${i}" data-layer="${layer}"><span class="sn">${i + 1}</span><span>${esc(txt)}</span></button></li>`).join('');

  // controls
  const st = $('#stage');
  if (st) {
    st.value = state.sc.stage;
    st.addEventListener('input', () => { state.sc.stage = Number(st.value); renderView(); writeUrl(); });
  }
  $$('.vtab').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; renderView(); writeUrl(); }));
  const ts = $('#tSlider');
  if (ts) {
    ts.value = isPodo(id) ? state.sc.week : state.sc.month;
    ts.addEventListener('input', () => { stopTime(); if (isPodo(id)) state.sc.week = Number(ts.value); else state.sc.month = Number(ts.value); updateDynamic(); });
  }
  const tx = $('#tx');
  if (tx) {
    tx.value = state.sc.txMonth;
    tx.addEventListener('input', () => { state.sc.txMonth = Number(tx.value); state.sc.noTx = false; $('#notx').checked = false; updateDynamic(); });
  }
  const p0 = $('#p0');
  if (p0) { p0.value = state.sc.pla2r0; p0.addEventListener('input', () => { state.sc.pla2r0 = Number(p0.value); updateDynamic(); }); }
  const notx = $('#notx');
  if (notx) { notx.checked = !!state.sc.noTx; notx.addEventListener('change', () => { state.sc.noTx = notx.checked; updateDynamic(); }); }
  $('#tplay')?.addEventListener('click', toggleTimePlay);
  $('#onlyAbn').checked = state.onlyAbnormal;
  $('#onlyAbn').addEventListener('change', (ev) => { state.onlyAbnormal = ev.target.checked; updateDynamic(); });
  $('#tree').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-ent]');
    if (b) selectEntity(b.dataset.ent);
  });
  $('#steps').addEventListener('click', (ev) => {
    const b = ev.target.closest('.stepbtn');
    if (!b) return;
    stopSteps();
    setHighlight(b.dataset.layer, Number(b.dataset.i));
  });
  $('#sall').addEventListener('click', () => { stopSteps(); setHighlight(null, null); });
  $('#splay').addEventListener('click', toggleSteps);
  renderView();
  renderSieve();
  updateDynamic();
}

function renderView() {
  stopAnimations();
  const id = state.entity;
  const e = M.ENTITIES[id];
  const stage = state.sc.stage || 2;
  $$('.vtab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
  if ($('#stageOut')) $('#stageOut').textContent = S.stages[stage];
  const view = $('#view'), extra = $('#viewExtra');
  if (state.view === 'glom') {
    view.innerHTML = `<div class="glomwrap">${glomSvg(id, 'gx', stage)}</div>`;
    const layers = layersOf(e, stage);
    extra.innerHTML = `<div class="layerlegend"><div class="lgtitle">${esc(S.legend)}</div><div class="lgs">` +
      layers.map((l) => `<button type="button" class="lgbtn" data-layer="${l}"><i style="background:${swatchFor(e, l)}"></i>${esc(l === 'circulating' ? `${S.layers.circulating}: ${S.circulatingWhat[e.visual.circulating]}` : S.layers[l])}</button>`).join('') +
      `</div><div class="lgs anat">${ANAT.map((l) => `<span class="lg"><i style="background:${swatchFor(e, l)}"></i>${esc(S.layers[l])}</span>`).join('')}</div></div>`;
    $$('.lgbtn', extra).forEach((b) => b.addEventListener('click', () => {
      stopSteps();
      setHighlight(state.highlight === b.dataset.layer ? null : b.dataset.layer, null);
    }));
  } else if (state.view === 'barrier') {
    view.innerHTML = `<h4 class="vtitle">${esc(S.barrierTitle)}</h4><div class="barrierwrap">${renderBarrier(e, { stage, titles: S.layers, labels: S.barrierLabels, label: `${S.barrierTitle}: ${S.entities[id].name}` })}</div>`;
    const reduced = reducedMotion();
    extra.innerHTML = `<div class="plegend">${M.PROTEIN_IDS.map((p) => `<span class="lg"><i style="background:${PCOLOR[p]};border-radius:50%"></i>${esc(S.proteins[p])}</span>`).join('')}</div>
      <div class="pcount"><span class="muted small">${esc(S.arrived)}</span> <span id="pcounts"></span> ${reduced ? '' : `<button type="button" class="btn ghost" id="ppause">${esc(particlesPaused ? S.resume : S.pause)}</button>`}</div>
      <p class="note">${esc(reduced ? S.reducedMotion : S.barrierNote)} <span class="tag">${esc(S.modelTag)}</span></p>`;
    const svg = $('#view svg');
    const show = (c) => { const el = $('#pcounts'); if (el) el.textContent = M.PROTEIN_IDS.map((p) => `${S.proteinShort[p]} ${c[p]}`).join(' · '); };
    const start = () => { particles = startParticles(svg, e.barrier, { reduced, onCount: show }); show(particles.counts); };
    if (!particlesPaused || reduced) start();
    else show(Object.fromEntries(M.PROTEIN_IDS.map((p) => [p, 0])));
    $('#ppause')?.addEventListener('click', (ev) => {
      particlesPaused = !particlesPaused;
      if (particlesPaused) { particles?.stop(); particles = null; } else start();
      ev.target.textContent = particlesPaused ? S.resume : S.pause;
    });
  } else {
    view.innerHTML = `<h4 class="vtitle">${esc(S.view3dTitle)}</h4><div class="v3dwrap"><canvas id="v3d" tabindex="0" role="img" aria-label="${esc(`${S.view3dTitle}: ${S.entities[id].name}. ${S.desc3d(e.visual)}`)}"></canvas></div>`;
    extra.innerHTML = `<div class="controls v3dctl"><label class="check"><input type="checkbox" id="showPodo"${state.showPodo ? ' checked' : ''}> ${esc(S.showPodo)}</label>
      <button type="button" class="btn ghost" id="rot">${esc(S.autoRotate)}</button> <button type="button" class="btn ghost" id="reset3d">${esc(S.reset)}</button></div>
      <p class="note">${esc(S.view3dHelp)}</p><p class="small">${esc(S.desc3d(e.visual))}</p>`;
    viewer = mount3d($('#v3d'), e, { stage, showPodocytes: state.showPodo });
    $('#showPodo').addEventListener('change', (ev) => { state.showPodo = ev.target.checked; viewer.set({ showPodocytes: state.showPodo }); writeUrl(); });
    $('#rot').addEventListener('click', (ev) => { const on = viewer.toggleAuto(); ev.target.setAttribute('aria-pressed', String(on)); });
    $('#reset3d').addEventListener('click', () => viewer.reset());
  }
  applyHighlight();
}

function applyHighlight() {
  const svg = $('#view svg');
  $$('.stepbtn').forEach((b) => b.classList.toggle('on', Number(b.dataset.i) === state.step));
  $$('.lgbtn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layer === state.highlight)));
  if (!svg) return;
  const has = state.highlight && svg.querySelector(`g[data-layer="${state.highlight}"]`);
  svg.classList.toggle('hl', !!has);
  $$('g[data-layer]', svg).forEach((g) => g.classList.toggle('on', g.dataset.layer === state.highlight));
}

function setHighlight(layer, step) {
  state.highlight = layer;
  state.step = step;
  applyHighlight();
}

function toggleSteps() {
  if (stepTimer) { stopSteps(); return; }
  const steps = S.entities[state.entity].steps;
  let i = state.step == null ? -1 : state.step;
  const tick = () => { i = (i + 1) % steps.length; setHighlight(steps[i][0], i); };
  tick();
  stepTimer = setInterval(tick, 2600);
  $('#splay').textContent = S.stop;
}

function stopSteps() {
  if (stepTimer) clearInterval(stepTimer);
  stepTimer = null;
  const b = $('#splay');
  if (b) b.textContent = S.play;
}

function toggleTimePlay() {
  if (timeTimer) { stopTime(); return; }
  const podo = isPodo(state.entity);
  const key = podo ? 'week' : 'month';
  const max = podo ? M.PODO.weeks : M.MN.months;
  if (state.sc[key] >= max) state.sc[key] = 0;
  timeTimer = setInterval(() => {
    state.sc[key] = Math.min(max, state.sc[key] + (podo ? 0.25 : 0.25));
    const d = $('#tSlider');
    if (d) d.value = state.sc[key];
    updateDynamic();
    if (state.sc[key] >= max) stopTime();
  }, 80);
  $('#tplay').textContent = S.stop;
}

function stopTime() {
  if (timeTimer) clearInterval(timeTimer);
  timeTimer = null;
  const b = $('#tplay');
  if (b) b.textContent = S.play;
}

function renderSieve() {
  const id = state.entity;
  const b = M.ENTITIES[id].barrier;
  barChartLog($('#sieveChart'), {
    title: S.sieveChart, categories: M.PROTEIN_IDS, yMin: 1e-6, yMax: 1,
    series: [
      { name: S.normalSeries, color: 'var(--neutral)', values: M.PROTEIN_IDS.map((p) => M.sieving(p)) },
      { name: S.entities[id].short, color: 'var(--c1)', values: M.PROTEIN_IDS.map((p) => M.sieving(p, b)) },
    ],
    fmtCat: (p) => S.proteinShort[p], fmtY: (v) => (v >= 0.01 ? nf(v, 2) : v.toExponential(1).replace('.', S.locale === 'es-ES' ? ',' : '.')), tableSummary: S.tableView,
  });
  const si = M.selectivityIndex(b);
  $('#si').textContent = S.siText(nf(si, 2), S.status[M.selectivityClass(si)]);
  const comp = M.filtrateComposition(b);
  $('#comp').innerHTML = `<div class="stackbar" role="img" aria-label="${esc(M.PROTEIN_IDS.map((p) => `${S.proteinShort[p]} ${nf(comp[p], 1)} %`).join(', '))}">${M.PROTEIN_IDS.map((p) => `<span style="flex:${Math.max(comp[p], 0.4)};background:${PCOLOR[p]}" title="${esc(S.proteinShort[p])}: ${nf(comp[p], 1)} %"></span>`).join('')}</div>
    <div class="legend">${M.PROTEIN_IDS.map((p) => `<span class="lg"><i style="background:${PCOLOR[p]}"></i>${esc(S.proteinShort[p])} ${nf(comp[p], 1)} %</span>`).join('')}</div>`;
}

function renderCascade(labs, id) {
  const age = M.ageOf(id);
  const prof = M.nephroticProfile(labs, age);
  const risk = M.thromboRisk(id, labs.albumin);
  const item = (txt, abn) => `<li class="${abn ? 'abn' : ''}">${esc(txt)}</li>`;
  $('#casc').innerHTML = [
    item(S.cascade.upcr(nf(labs.upcr, labs.upcr < 1 ? 2 : 1), prof.nephroticRange), prof.nephroticRange),
    item(S.cascade.albumin(nf(labs.albumin, 1)), M.status('albumin', labs.albumin) === 'low'),
    item(S.cascade.edema(Math.round(labs.edema)), labs.edema >= 1),
    item(S.cascade.lipids(nf(labs.chol)), M.status('chol', labs.chol) === 'high'),
    item(S.cascade.atiii(nf(labs.atiii), S.thrombo[risk]), risk !== 'low'),
    item(S.cascade.igg(nf(labs.igg)), M.status('igg', labs.igg) === 'low'),
  ].join('');
  let v = S.verdict.remission;
  if (prof.syndrome) v = prof.pure ? S.verdict.pure : S.verdict.impure;
  else if (prof.nephroticRange) v = S.verdict.notSyndrome;
  $('#verdict').textContent = v;
}

function renderRisk(labs) {
  const el = $('#riskCard');
  if (!el) return;
  const r = M.mnRisk(labs);
  el.innerHTML = `<h4>${esc(S.riskTitle)}</h4><p><span class="st st-${r.risk === 'low' ? 'normal' : 'high'}">${esc(S.risks[r.risk])}</span> <span class="small muted">${esc(S.riskNow)}</span></p>
    <p class="small">${esc(r.reasons.map((k) => S.riskReasons[k]).join(' · '))}</p><p><b>${esc(S.riskTx[r.risk])}</b></p><p class="note">${esc(S.riskNote)}</p>`;
}

const fmtWeek = (v, tick) => (tick ? nf(v, Number.isInteger(v) ? 0 : 1) : `${lang === 'es' ? 'Sem.' : 'Wk'} ${nf(v, Number.isInteger(v) ? 0 : 2)}`);
const fmtMonth = (v, tick) => (tick ? nf(v, Number.isInteger(v) ? 0 : 1) : `${lang === 'es' ? 'Mes' : 'Month'} ${nf(v, Number.isInteger(v) ? 0 : 2)}`);

function podoChart(el, ids, cursor = null, highlight = null) {
  const x = M.podoSeries('mcd', 0.25).week;
  const age = highlight ? M.ageOf(highlight) : 'adult';
  lineChart(el, {
    title: S.podoChart, x, yMin: 0, yMax: 12, xLabel: S.weekLabel, yLabel: 'g/g',
    series: ids.map((pid) => ({ name: S.entities[pid].short, color: CAT[PODO_IDS.indexOf(pid)], dash: highlight != null && pid !== highlight, values: x.map((w) => M.podoUpcr(pid, w)) })),
    hlines: [{ y: 3.5, label: S.nephroticLine }, { y: 0.3, label: S.crLine }],
    markers: highlight && M.PODO[highlight].therapy === 'steroids' ? [{ x: M.resistanceWeek(age), label: S.resistMark(age) }] : [],
    cursor, fmtX: fmtWeek, fmtY: (v) => nf(v, v < 1 ? 2 : 1), tableSummary: S.tableView,
  });
}

function updateDynamic() {
  const id = state.entity;
  const labs = currentLabs();
  const age = M.ageOf(id);
  $('#labs').innerHTML = renderLabs(labs, age, { onlyAbnormal: state.onlyAbnormal });
  renderCascade(labs, id);
  renderRisk(labs);
  const charts = $('#charts');
  if (isPodo(id)) {
    const w = state.sc.week;
    $('#tOut').textContent = nf(w, Number.isInteger(w) ? 0 : 1);
    const u0 = M.typicalLabs(id).upcr;
    const rem = M.remission(labs.upcr, u0, age, labs.albumin);
    $('#live').textContent = S.podoLive({ week: nf(w, Number.isInteger(w) ? 0 : 1), upcr: nf(labs.upcr, labs.upcr < 1 ? 2 : 1), alb: nf(labs.albumin, 1), rem: S.remissionNames[rem] });
    const rw = M.resistanceWeek(age);
    const atR = M.remission(M.podoUpcr(id, rw), u0, age, M.podoLabs(id, rw).albumin);
    const crw = M.weekOfRemission(id);
    $('#tnote').textContent = `${S.podoOutcome({ therapy: M.PODO[id].therapy, crWeek: crw == null ? null : nf(Math.ceil(crw)), resistWeek: rw, atResist: atR })} ${S.podoNote}`;
    charts.innerHTML = '<div class="chart" id="ch1"></div>';
    podoChart($('#ch1'), PODO_IDS, w, id);
  } else if (course(id) === 'mn') {
    const sc = state.sc;
    const opts = M.mnOpts(sc);
    $('#tOut').textContent = nf(sc.month, Number.isInteger(sc.month) ? 0 : 1);
    $('#txOut').textContent = sc.noTx ? '—' : nf(sc.txMonth, Number.isInteger(sc.txMonth) ? 0 : 1);
    $('#p0Out').textContent = nf(sc.pla2r0);
    $('#live').textContent = S.mnLive({ month: nf(sc.month, Number.isInteger(sc.month) ? 0 : 1), pla2r: nf(labs.pla2r, labs.pla2r < 10 ? 1 : 0), upcr: nf(labs.upcr, labs.upcr < 1 ? 2 : 1), alb: nf(labs.albumin, 1) });
    const ms = M.mnMilestones(opts.txMonth, opts.pla2r0);
    $('#tnote').textContent = `${S.mnMilestones(ms, (v) => (v == null ? S.notReached : S.monthN(nf(v, Number.isInteger(v) ? 0 : 1))))} ${S.mnNote}`;
    const m = M.mnModel({ txMonth: opts.txMonth, pla2r0: opts.pla2r0 });
    const mNo = M.mnModel({ txMonth: null, pla2r0: opts.pla2r0 });
    const marks = sc.noTx ? [] : [{ x: sc.txMonth, label: S.markers.tx, cls: 'vline tx' }];
    const ser = (key) => (sc.noTx
      ? [{ name: S.series.notx, color: CAT[1], values: mNo[key] }]
      : [{ name: S.series.tx, color: CAT[0], values: m[key] }, { name: S.series.notx, color: CAT[1], dash: true, values: mNo[key] }]);
    charts.innerHTML = '<div class="chart" id="ch1"></div><div class="chart" id="ch2"></div><div class="chart" id="ch3"></div>';
    const common = { x: m.month, xLabel: S.monthLabel, markers: marks, cursor: sc.month, fmtX: fmtMonth, tableSummary: S.tableView };
    lineChart($('#ch1'), { ...common, title: S.pla2rChart, yMin: 0, yMax: Math.max(60, opts.pla2r0 * 1.1), yLabel: S.units.pla2r, series: ser('pla2r'), hlines: [{ y: 14, label: S.lines.pos }, { y: 50, label: S.lines.high }], fmtY: (v) => nf(v, v < 10 ? 1 : 0) });
    lineChart($('#ch2'), { ...common, title: S.upcrChart, yMin: 0, yMax: 10, yLabel: 'g/g', series: ser('upcr'), hlines: [{ y: 3.5, label: S.lines.nephrotic }, { y: 0.3, label: S.lines.cr }], fmtY: (v) => nf(v, v < 1 ? 2 : 1) });
    lineChart($('#ch3'), { ...common, title: S.albChart, yMin: 1, yMax: 4.5, yLabel: 'g/dL', series: ser('albumin'), hlines: [{ y: 2.5, label: S.lines.thrombo }], fmtY: (v) => nf(v, 1) });
  }
  writeUrl();
}

function selectEntity(id) {
  stopSteps(); stopTime();
  state.entity = id;
  state.sc = M.defaultScenario(id);
  state.highlight = null; state.step = null;
  renderExploreShell();
  $('#entName')?.focus?.();
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------
function entitySelect(idAttr, value) {
  return `<select id="${idAttr}">${M.TREE.map((b) => `<optgroup label="${esc(S.groups[b.group])}">${b.ids.map((id) => `<option value="${id}"${id === value ? ' selected' : ''}>${esc(S.entities[id].name)}</option>`).join('')}</optgroup>`).join('')}</select>`;
}

function featureText(f, id) {
  const v = M.feature(id, f);
  switch (f) {
    case 'group': return S.groups[v];
    case 'age': return S.ageGroups[v];
    case 'ifPattern': return S.ifPatterns[v];
    case 'selectivity': return S.status[v];
    default: return S.keys[f]?.[v] ?? S.none;
  }
}

function renderCompare() {
  const { a, b, onlyDiff } = state.cmp;
  const c = M.compare(a, b);
  const nDiff = c.labs.filter((r) => r.differs).length + c.features.filter((r) => r.differs).length;
  const ageA = M.ageOf(a), ageB = M.ageOf(b);
  const col = (id, p) => `<section class="card cmpcol"><h2>${esc(S.entities[id].name)}</h2><div class="chips">${chipsHtml(id)}</div>
      <div class="cmpvis"><div class="glomwrap">${glomSvg(id, p + 'g', 2)}</div><div class="ifcol">${renderIF(M.ENTITIES[id].if.pattern, { idPrefix: p + 'i', label: S.ifPatterns[M.ENTITIES[id].if.pattern] })}<p class="small">${esc(S.ifPatterns[M.ENTITIES[id].if.pattern])}</p></div></div></section>`;
  const feats = c.features.filter((r) => !onlyDiff || r.differs).map((r) => `<tr class="${r.differs ? 'diff' : ''}"><th scope="row">${r.differs ? '<span class="neq" aria-hidden="true">≠</span> ' : ''}${esc(S.features[r.key])}</th><td>${esc(featureText(r.key, a))}</td><td>${esc(featureText(r.key, b))}</td><td>${r.differs ? `<span class="st st-pos">${esc(S.differs)}</span>` : `<span class="muted">${esc(S.same)}</span>`}</td></tr>`).join('');
  const labs = c.labs.filter((r) => !onlyDiff || r.differs).map((r) => {
    const p = M.paramByKey[r.key];
    return `<tr class="${r.differs ? 'diff' : ''}" data-param="${r.key}"><th scope="row">${r.differs ? '<span class="neq" aria-hidden="true">≠</span> ' : ''}${esc(S.params[r.key])}<div class="small muted">${esc(S.normalIs(normalText(p, 'adult')))}</div></th>` +
      `<td>${p.kind === 'qual' ? '' : esc(valueText(p, r.a))} ${badge(r.statusA, p)}</td><td>${p.kind === 'qual' ? '' : esc(valueText(p, r.b))} ${badge(r.statusB, p)}</td></tr>`;
  }).join('');
  const showPodo = PODO_IDS.includes(a) && PODO_IDS.includes(b) && a !== b;
  $('#app').innerHTML = `<div class="g-compare">
    <section class="card cmpctl">
      <label>${esc(S.entityA)} ${entitySelect('selA', a)}</label>
      <button type="button" class="btn ghost" id="swap" aria-label="⇄">⇄</button>
      <label>${esc(S.entityB)} ${entitySelect('selB', b)}</label>
      <label class="check"><input type="checkbox" id="onlyDiff"${onlyDiff ? ' checked' : ''}> ${esc(S.onlyDiff)}</label>
      <span class="diffcount">${esc(S.diffCount(nDiff))}</span>
    </section>
    <div class="cmpcols">${col(a, 'a')}${col(b, 'b')}</div>
    <section class="card"><h3>${esc(S.featuresTitle)}</h3><div class="tblwrap"><table class="cmp fcmp"><thead><tr><th></th><th>${esc(S.entities[a].short)}</th><th>${esc(S.entities[b].short)}</th><th></th></tr></thead><tbody>${feats}</tbody></table></div></section>
    ${showPodo ? `<section class="card"><div class="chart" id="podoCmp"></div><p class="note">${esc(S.therapy.steroids)}</p></section>` : ''}
    <section class="card"><h3>${esc(S.labsTitle)}</h3><p class="note">${esc(S.labsNote)}</p><div class="tblwrap"><table class="cmp labs-cmp"><thead><tr><th></th><th>${esc(S.entities[a].short)}${ageA === 'child' ? ` (${esc(S.ageGroups.child)})` : ''}</th><th>${esc(S.entities[b].short)}${ageB === 'child' ? ` (${esc(S.ageGroups.child)})` : ''}</th></tr></thead><tbody>${labs}</tbody></table></div></section>
  </div>`;
  $('#selA').addEventListener('change', (ev) => { state.cmp.a = ev.target.value; renderCompare(); });
  $('#selB').addEventListener('change', (ev) => { state.cmp.b = ev.target.value; renderCompare(); });
  $('#swap').addEventListener('click', () => { [state.cmp.a, state.cmp.b] = [state.cmp.b, state.cmp.a]; renderCompare(); });
  $('#onlyDiff').addEventListener('change', (ev) => { state.cmp.onlyDiff = ev.target.checked; renderCompare(); });
  if (showPodo) podoChart($('#podoCmp'), [a, b]);
  writeUrl();
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------
let caseCache = null;
function currentCase() {
  if (state.quiz.seed == null) state.quiz.seed = Math.floor(Math.random() * 1e6);
  if (!caseCache || caseCache.seed !== state.quiz.seed) caseCache = M.generateCase(state.quiz.seed);
  return caseCache;
}

function biopsyHtml(c) {
  if (!c.biopsy) return `<h4>${esc(S.biopsyTitle)}</h4><p>${esc(S.biopsyNone[c.entity] || '')}</p>`;
  if (c.biopsy.site === 'fat') {
    return `<div class="ifbox">${renderIF('congo', { idPrefix: 'qi', label: S.congoTitle })}<div><h4>${esc(S.biopsyFat)}</h4><p>${esc(S.congoTitle)}: ${esc(S.ifPatterns.congo)}</p></div></div>`;
  }
  return `<div class="ifbox">${renderIF(c.biopsy.if, { idPrefix: 'qi', label: S.ifTitle })}<div><h4>${esc(S.biopsyTitle)} · ${esc(S.ifTitle)}</h4><p>${esc(S.ifPatterns[c.biopsy.if])}</p>
    <p class="small"><b>${esc(S.lmTitle)}:</b> ${esc(S.keys.lm[c.biopsy.lm])}<br><b>${esc(S.emTitle)}:</b> ${esc(S.keys.em[c.biopsy.em])}</p></div></div>`;
}

function renderQuiz() {
  const c = currentCase();
  const q = state.quiz;
  const vig = [`<li>${esc(S.patientAge(c.age, c.years))}</li>`];
  if (c.signs.length) for (const s of c.signs) vig.push(`<li>${esc(S.signs[s])}</li>`);
  else vig.push(`<li>${esc(S.noSigns)}</li>`);
  let feedback = '';
  if (q.choice) {
    const ok = q.choice === c.entity;
    const r = M.classify(M.findingsFrom(c.entity, c.labs, { signs: c.signs, biopsy: c.biopsy }));
    feedback = `<section class="card a-feedback" aria-live="polite"><h3 class="${ok ? 'ok' : 'ko'}">${esc(ok ? S.correct : S.wrong(S.entities[c.entity].name))}</h3>
      <h4>${esc(S.reasoning)}</h4><ol class="reason">${r.steps.map((k) => `<li>${esc(S.steps[k])}</li>`).join('')}</ol>
      <h4>${esc(S.reveal)}: ${esc(S.entities[c.entity].name)}</h4><div class="glomwrap small-glom">${glomSvg(c.entity, 'qg', 2)}</div>
      <p><a class="btn" href="?lang=${lang}&mode=explore&entity=${c.entity}">${esc(S.openExplore)}</a></p></section>`;
  }
  $('#app').innerHTML = `<div class="g-quiz">
    <section class="card a-case"><div class="rowhead"><h2>${esc(S.caseTitle(q.n))}</h2><div><span class="score">${esc(S.score(q.ok, q.total))}</span> <button type="button" class="btn" id="newCase">${esc(S.newCase)}</button></div></div>
      <h4>${esc(S.vignette)}</h4><ul class="vig">${vig.join('')}</ul>${biopsyHtml(c)}</section>
    <aside class="card a-tree" id="tree"><p class="ask">${esc(S.whichDx)}</p>${treeHtml({ answer: true })}</aside>
    ${feedback}
    <section class="card a-labs"><div class="rowhead"><h3>${esc(S.labsTitle)}</h3><label class="check"><input type="checkbox" id="onlyAbn"${state.onlyAbnormal ? ' checked' : ''}> ${esc(S.onlyAbnormal)}</label></div><p class="note">${esc(S.labsNote)}</p><div class="labs">${renderLabs(c.labs, c.age, { onlyAbnormal: state.onlyAbnormal })}</div></section>
  </div>`;
  $('#newCase').addEventListener('click', () => {
    state.quiz.seed = Math.floor(Math.random() * 1e6);
    state.quiz.n += 1;
    state.quiz.choice = null;
    renderQuiz();
  });
  $('#onlyAbn').addEventListener('change', (ev) => { state.onlyAbnormal = ev.target.checked; renderQuiz(); });
  $('#tree').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-ent]');
    if (!b || state.quiz.choice) return;
    state.quiz.choice = b.dataset.ent;
    state.quiz.total += 1;
    if (b.dataset.ent === c.entity) state.quiz.ok += 1;
    renderQuiz();
    $('.a-feedback h3')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  writeUrl();
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------
function renderFrame() {
  document.documentElement.lang = lang;
  document.title = S.title;
  $('#title').textContent = S.title;
  $('#subtitle').textContent = S.subtitle;
  $('#footer').textContent = S.footer;
  $('#footerModel').textContent = S.footerModel;
  $('#seeAlso').textContent = S.seeAlso;
  $('#seeAlso').href = `https://ferasmed-dev.github.io/nephritic-glomerulus/?lang=${lang}`;
  $('#copy').textContent = S.copyLink;
  $$('.langbtn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  $$('.tab').forEach((b) => {
    b.textContent = S.modes[b.dataset.mode];
    b.setAttribute('aria-selected', String(b.dataset.mode === state.mode));
  });
  $('#hint').textContent = S.modesHint[state.mode];
}

function render() {
  stopSteps(); stopTime(); stopAnimations();
  renderFrame();
  if (state.mode === 'explore') renderExploreShell();
  else if (state.mode === 'compare') renderCompare();
  else renderQuiz();
}

function init() {
  readUrl();
  $$('.langbtn').forEach((b) => b.addEventListener('click', () => {
    if (!LANGS.includes(b.dataset.lang)) return;
    lang = b.dataset.lang; S = STRINGS[lang];
    store.set('ngn-lang', lang);
    render();
  }));
  $$('.tab').forEach((b) => b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    render();
  }));
  $('#copy').addEventListener('click', async () => {
    writeUrl();
    try { await navigator.clipboard.writeText(location.href); } catch { /* clipboard blocked */ }
    const btn = $('#copy');
    btn.textContent = S.copied;
    setTimeout(() => { btn.textContent = S.copyLink; }, 1500);
  });
  render();
}

window.__sim = {
  get state() { return state; },
  get lang() { return lang; },
  model: M,
  labs: () => currentLabs(),
  quizCase: () => currentCase(),
  particleCounts: () => particles?.counts ?? null,
  viewer: () => viewer?.state ?? null,
  set(patch) { Object.assign(state, patch); render(); },
  render,
};

init();
