// Filtration barrier at electron-microscopy scale (one strip of capillary
// wall) with plasma proteins that try to cross it. The probability that a
// particle crosses comes from the sieve model in model.js, amplified so the
// rare events are visible (Modelo).

import { sieving, PROTEINS, PROTEIN_IDS } from './model.js';

export const VB = { w: 640, h: 300 };
export const AMPLIFY = 30;
export const PCOLOR = { b2m: 'var(--c3)', albumin: 'var(--c2)', transferrin: 'var(--c4)', igg: 'var(--c1)' };
const PR = (id) => PROTEINS[id].radius * 1.6; // particle radius in px

const f1 = (n) => Math.round(n * 10) / 10;

function seeded(n) {
  let a = n;
  return () => { a = (a * 9301 + 49297) % 233280; return a / 233280; };
}

function layer(name, title, inner) {
  return `<g data-layer="${name}"><title>${title}</title>${inner}</g>`;
}

/** Geometry of the strip for an entity (y positions of each layer). */
export function geometry(entity, stage = 2) {
  const v = entity.visual;
  let gbm = 30;
  if (v.gbmThick) gbm += 22 * v.gbmThick;
  if (v.subepi && stage >= 3) gbm += stage === 4 ? 22 : 16;
  if (v.dense) gbm += 8;
  if (v.amyloid) gbm += 14;
  const interpose = v.doubleContour ? 18 : 0;
  const endoTop = 96 - interpose;
  const gbmTop = 106;
  const gbmBot = gbmTop + gbm;
  const podoTop = gbmBot + (v.subepi && stage <= 2 ? 13 : 0); // deposits lift the podocyte
  const podoBot = podoTop + 24;
  return { endoTop, endoBot: endoTop + 10, gbmTop, gbmBot, podoTop, podoBot, interpose };
}

/**
 * Static structure of the barrier. opts: { stage, titles, label }
 * The returned SVG has an empty <g class="pt"> for the particles.
 */
export function renderBarrier(entity, opts = {}) {
  const v = entity.visual;
  const stage = opts.stage || 2;
  const T = opts.titles || {};
  const t = (k) => T[k] || k;
  const g = geometry(entity, stage);
  const W = VB.w;
  const rnd = seeded(5);
  let s = '<g class="anat">';
  // lumen, Bowman's space
  s += `<rect x="0" y="0" width="${W}" height="${g.endoTop}" fill="var(--g-lumen)"/>`;
  s += `<rect x="0" y="${g.podoBot - 4}" width="${W}" height="${VB.h - g.podoBot + 4}" fill="var(--g-bowman)"/>`;
  s += `<ellipse cx="400" cy="40" rx="44" ry="16" fill="var(--g-rbc)" opacity="0.8"/>`;
  // endothelium with fenestrae
  for (let x = 0; x < W; x += 46) s += `<rect x="${x}" y="${g.endoTop}" width="38" height="10" rx="4" fill="var(--g-endo)"/>`;
  // GBM with lamina densa
  s += `<rect x="0" y="${g.gbmTop}" width="${W}" height="${g.gbmBot - g.gbmTop}" fill="var(--g-gbm-light)"/>`;
  s += `<rect x="0" y="${(g.gbmTop + g.gbmBot) / 2 - 5}" width="${W}" height="10" fill="var(--g-gbm)" opacity="0.55"/>`;
  s += '</g>';

  // negative charges (heparan sulfate): fewer when charge is lost
  const nCharges = Math.round(18 * (1 - (entity.barrier?.chargeLoss ?? 0)));
  let ch = '';
  for (let k = 0; k < 18; k++) {
    if (k >= nCharges) continue;
    const x = 18 + k * 35.5;
    ch += `<text x="${f1(x)}" y="${g.gbmTop + 12}" class="b-charge" text-anchor="middle">−</text>`;
  }
  s += layer('charges', t('charges'), ch);

  // interposition (MPGN): mesangial cell between endothelium and a new GBM layer
  if (v.doubleContour) {
    let c = `<rect x="0" y="${g.endoBot}" width="${W}" height="3" fill="var(--g-gbm)"/>`;
    for (const x of [60, 300, 520]) c += `<ellipse cx="${x}" cy="${g.endoBot + 9}" rx="40" ry="6" fill="var(--g-mes)"/><circle cx="${x}" cy="${g.endoBot + 9}" r="3.5" fill="var(--g-nucleus)"/>`;
    s += layer('doubleContour', t('doubleContour'), c);
  }
  // subendothelial deposits
  if (v.subendo || v.c3dep) {
    const col = v.c3dep ? 'var(--g-dep-c3)' : 'var(--g-dep-ic)';
    let c = '';
    for (let x = 30; x < W; x += 58) c += `<ellipse cx="${x + rnd() * 10}" cy="${g.gbmTop + 6}" rx="11" ry="5" fill="${col}"/>`;
    s += layer(v.c3dep ? 'c3dep' : 'subendo', t(v.c3dep ? 'c3dep' : 'subendo'), c);
  }
  // dense deposits (DDD)
  if (v.dense) {
    s += layer('dense', t('dense'), `<rect x="0" y="${(g.gbmTop + g.gbmBot) / 2 - 7}" width="${W}" height="14" rx="6" fill="var(--g-dense)"/>`);
  }
  // amyloid fibrils
  if (v.amyloid) {
    let c = '';
    for (let k = 0; k < 160; k++) {
      const x = rnd() * W, y = g.gbmTop + rnd() * (g.gbmBot - g.gbmTop + 10);
      const a = rnd() * Math.PI;
      c += `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x + 9 * Math.cos(a))}" y2="${f1(y + 9 * Math.sin(a))}" stroke="var(--g-amyloid-edge)" stroke-width="1"/>`;
    }
    s += layer('amyloid', t('amyloid'), c);
  }
  // thick GBM (diabetic)
  if (v.gbmThick) {
    s += layer('gbmThick', t('gbmThick'), `<rect x="0" y="${g.gbmBot - 4}" width="${W}" height="4" fill="var(--g-gbm)"/><rect x="0" y="${g.gbmTop}" width="${W}" height="3" fill="var(--g-gbm)"/>`);
  }

  // membranous nephropathy: deposits, spikes, thickening
  if (v.subepi) {
    let dep = '', spk = '', thick = '';
    const xs = [];
    for (let x = 22; x < W; x += 44) xs.push(x);
    if (stage >= 3) thick += `<rect x="0" y="${g.gbmBot - (stage === 4 ? 26 : 20)}" width="${W}" height="${stage === 4 ? 26 : 20}" fill="var(--g-gbm)" opacity="0.7"/>`;
    xs.forEach((x, k) => {
      if (stage === 4) {
        if (k % 2 === 0) thick += `<ellipse cx="${x}" cy="${g.gbmBot - 12}" rx="10" ry="6" fill="var(--g-gbm-light)"/>`;
        return;
      }
      const y = stage === 3 ? g.gbmBot - 10 : g.gbmBot + 6.5;
      dep += `<ellipse cx="${x}" cy="${y}" rx="${stage === 1 ? 9 : 12}" ry="${stage === 1 ? 5 : 7}" fill="var(--g-dep-igg)" stroke="var(--g-igg-edge)" stroke-width="0.8"/>`;
      if (stage === 2 && k < xs.length - 1) spk += `<rect x="${x + 18}" y="${g.gbmBot - 2}" width="7" height="${g.podoTop - g.gbmBot + 3}" rx="3" fill="var(--g-gbm)"/>`;
    });
    if (thick) s += layer('gbmThick', t('gbmThick'), thick);
    if (dep) s += layer('subepi', t('subepi'), dep);
    if (spk) s += layer('spikes', t('spikes'), spk);
  }

  // podocyte foot processes (normal) or effaced sheet
  const eff = v.effacement;
  const sclerosisFrom = v.sclerosis ? W * 0.74 : W + 1;
  let fp = '';
  let effHtml = '';
  for (let x = 0, k = 0; x < W; x += 28, k++) {
    if (x > sclerosisFrom) break;
    const effaced = eff === 'diffuse' || (eff === 'segmental' && x < W * 0.5);
    if (effaced) continue;
    fp += `<rect x="${x + 2}" y="${g.podoTop}" width="21" height="20" rx="7" fill="${k % 2 ? 'var(--g-podo)' : 'var(--g-podo2)'}"/>`;
    fp += `<line x1="${x + 23}" x2="${x + 30}" y1="${g.podoTop + 3}" y2="${g.podoTop + 3}" stroke="var(--g-slit)" stroke-width="1.6" stroke-dasharray="1.5 1"/>`;
  }
  if (eff) {
    const x1 = Math.min(sclerosisFrom, eff === 'diffuse' ? W : W * 0.5);
    const y0 = g.podoTop;
    effHtml = `<path d="M0 ${y0} H${f1(x1)} V${y0 + 14} Q${f1(x1 * 0.75)} ${y0 + 20} ${f1(x1 * 0.5)} ${y0 + 13} T0 ${y0 + 15} Z" fill="var(--g-podo)"/>`;
  }
  s += `<g class="anat">${fp}</g>`;
  if (effHtml) s += layer('effacement', t('effacement'), effHtml);
  // podocyte cell bodies
  let bodies = '';
  for (const x of [130, 420]) {
    if (x > sclerosisFrom) continue;
    bodies += `<ellipse cx="${x}" cy="${g.podoBot + 30}" rx="70" ry="26" fill="var(--g-podo)"/><circle cx="${x}" cy="${g.podoBot + 32}" r="9" fill="var(--g-nucleus)"/>`;
    bodies += `<path d="M${x - 50} ${g.podoBot + 18} Q${x - 70} ${g.podoBot} ${x - 90} ${g.podoTop + 18} M${x + 50} ${g.podoBot + 18} Q${x + 70} ${g.podoBot} ${x + 90} ${g.podoTop + 18}" stroke="var(--g-podo)" stroke-width="10" fill="none" stroke-linecap="round"/>`;
  }
  s += `<g class="anat">${bodies}</g>`;
  // FSGS: denuded GBM + hyaline insudation
  if (v.sclerosis) {
    const x0 = sclerosisFrom;
    let c = `<rect x="${x0}" y="${g.gbmTop}" width="${W - x0}" height="${g.gbmBot - g.gbmTop}" fill="var(--g-hyaline)" opacity="0.75"/>`;
    c += `<ellipse cx="${x0 + 80}" cy="${g.podoBot + 40}" rx="38" ry="18" fill="var(--g-podo)" opacity="0.65" transform="rotate(-12 ${x0 + 80} ${g.podoBot + 40})"/>`;
    s += layer('sclerosis', t('sclerosis'), c);
  }
  // collapsing: hyperplastic podocytes crowd Bowman's space
  if (v.collapse) {
    let c = '';
    for (let k = 0; k < 7; k++) {
      const x = 40 + k * 88, y = g.podoBot + 70 + (k % 2) * 30;
      c += `<ellipse cx="${x}" cy="${y}" rx="34" ry="22" fill="var(--g-podo)" stroke="var(--g-podo-edge)"/><circle cx="${x}" cy="${y}" r="8" fill="var(--g-nucleus)"/>`;
    }
    s += layer('collapse', t('collapse'), c);
  }
  // labels
  const lab = (y, k) => `<text x="${W - 8}" y="${y}" class="b-lab" text-anchor="end">${opts.labels?.[k] ?? k}</text>`;
  s += `<g class="b-labels">${lab(16, 'lumen')}${lab(g.gbmTop - (v.doubleContour ? 24 : 4), 'endothelium')}${lab((g.gbmTop + g.gbmBot) / 2 + 4, 'gbm')}${lab(g.podoBot + 66, 'bowman')}</g>`;
  s += '<g class="pt"></g>';
  const label = opts.label ? ` aria-label="${opts.label}"` : '';
  return `<svg viewBox="0 0 ${VB.w} ${VB.h}" class="barrier" role="img" data-top="${g.endoTop}" data-bot="${g.podoBot}"${label}>${s}</svg>`;
}

/** Crossing probability per protein (amplified, capped at 1). */
export function crossProb(barrier) {
  return Object.fromEntries(PROTEIN_IDS.map((id) => [id, Math.min(1, sieving(id, barrier) * AMPLIFY)]));
}

/**
 * Animates the particles. Returns { stop(), counts }.
 * reduced: draw a deterministic still instead of moving particles.
 */
export function startParticles(svg, barrier, { reduced = false, onCount = null } = {}) {
  const g = svg.querySelector('g.pt');
  const top = Number(svg.dataset.top), bot = Number(svg.dataset.bot);
  const p = crossProb(barrier);
  const rnd = seeded(3);
  const counts = Object.fromEntries(PROTEIN_IDS.map((id) => [id, 0]));
  const NS = 'http://www.w3.org/2000/svg';
  if (reduced) {
    let html = '';
    PROTEIN_IDS.forEach((id, k) => {
      for (let i = 0; i < 6; i++) html += `<circle cx="${f1(30 + rnd() * 560)}" cy="${f1(14 + rnd() * (top - 30))}" r="${PR(id)}" fill="${PCOLOR[id]}"/>`;
      const n = Math.round(p[id] * 12);
      for (let i = 0; i < n; i++) html += `<circle cx="${f1(40 + k * 150 + i * 18)}" cy="${f1(VB.h - 18 - (i % 2) * 14)}" r="${PR(id)}" fill="${PCOLOR[id]}"/>`;
    });
    g.innerHTML = html;
    return { stop() {}, counts };
  }
  const parts = [];
  PROTEIN_IDS.forEach((id) => {
    for (let i = 0; i < 7; i++) {
      const el = document.createElementNS(NS, 'circle');
      el.setAttribute('r', PR(id));
      el.setAttribute('fill', PCOLOR[id]);
      g.appendChild(el);
      parts.push({ id, el, x: 20 + rnd() * 600, y: 10 + rnd() * (top - 20), vx: (rnd() - 0.5) * 0.8, vy: 0.4 + rnd() * 0.6, state: 'lumen' });
    }
  });
  let raf = 0, last = 0, alive = true;
  const step = (ts) => {
    if (!alive) return;
    const dt = last ? Math.min(3, (ts - last) / 16.7) : 1;
    last = ts;
    for (const q of parts) {
      q.x += q.vx * dt;
      if (q.x < 10 || q.x > 630) q.vx = -q.vx;
      if (q.state === 'lumen') {
        q.y += q.vy * dt;
        if (q.y < 8) q.vy = Math.abs(q.vy);
        if (q.y >= top - PR(q.id)) {
          if (rnd() < p[q.id]) { q.state = 'cross'; q.vy = 0.8; q.vx = 0; }
          else { q.vy = -Math.abs(q.vy); q.y = top - PR(q.id) - 1; }
        }
      } else if (q.state === 'cross') {
        q.y += q.vy * dt;
        if (q.y > bot + 6) { q.state = 'urine'; q.vy = 1.8; q.vx = (rnd() - 0.5) * 0.6; }
      } else {
        q.y += q.vy * dt;
        if (q.y > VB.h + 10) {
          counts[q.id] += 1;
          onCount?.(counts);
          q.state = 'lumen'; q.y = 6; q.x = 20 + rnd() * 600; q.vy = 0.4 + rnd() * 0.6; q.vx = (rnd() - 0.5) * 0.8;
        }
      }
      q.el.setAttribute('cx', f1(q.x));
      q.el.setAttribute('cy', f1(q.y));
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return { stop() { alive = false; cancelAnimationFrame(raf); }, counts };
}
