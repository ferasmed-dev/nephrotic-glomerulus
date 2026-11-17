// Hand-drawn SVG glomerulus (schematic cross-section) and IF panel.
// renderGlomerulus() returns an SVG string; every pathological layer is a
// <g data-layer="..."> so the UI can highlight one step of the pathogenesis.

const CX = 200, CY = 182, R = 50;
const LOOPS = [[132, 124], [268, 124], [132, 240], [268, 240]];
const CAP = { rx: 188, ry: 170 };

const f1 = (n) => Math.round(n * 10) / 10;
const pol = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const outward = ([x, y]) => Math.atan2(y - CY, x - CX);

function arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = pol(cx, cy, r, a0);
  const [x1, y1] = pol(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  return `M${f1(x0)} ${f1(y0)} A${r} ${r} 0 ${large} 1 ${f1(x1)} ${f1(y1)}`;
}

/** Angles on the urinary side of a loop (podocytes do not face the mesangium). */
function urinaryAngles(loop, n, span = 2.2) {
  const out = outward(loop);
  const a = [];
  for (let k = 0; k < n; k++) a.push(out - span + (2 * span * (k + 0.5)) / n);
  return a;
}

function antibody(x, y, color, rot = 0, s = 1) {
  return `<path d="M0 6 L0 0 L-4 -5 M0 0 L4 -5" transform="translate(${f1(x)} ${f1(y)}) rotate(${rot}) scale(${s})" stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
}

function seeded(n) {
  let a = n;
  return () => { a = (a * 9301 + 49297) % 233280; return a / 233280; };
}

// ---------------------------------------------------------------------------
function arterioles() {
  // vascular pole at the top: afferent (wider) and efferent arterioles
  let s = '';
  for (const [x, w] of [[184, 9], [216, 6.5]]) {
    s += `<path d="M${x} -30 L${x} 112" stroke="var(--g-art)" stroke-width="${w * 2 + 6}" stroke-linecap="round" fill="none"/>`;
    s += `<path d="M${x} -30 L${x} 112" stroke="var(--g-lumen)" stroke-width="${w * 2}" stroke-linecap="round" fill="none"/>`;
  }
  return s;
}

function anatomy() {
  let s = '<g class="anat">';
  s += `<ellipse cx="${CX}" cy="${CY}" rx="${CAP.rx}" ry="${CAP.ry}" fill="var(--g-bowman)" stroke="var(--g-capsule)" stroke-width="3"/>`;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    if (Math.abs(a - Math.PI * 1.5) < 0.18) continue; // vascular pole
    const x = CX + (CAP.rx - 4) * Math.cos(a), y = CY + (CAP.ry - 4) * Math.sin(a);
    const tang = (Math.atan2(CAP.ry * Math.cos(a), -CAP.rx * Math.sin(a)) * 180) / Math.PI;
    s += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="7" ry="2.2" transform="rotate(${f1(tang)} ${f1(x)} ${f1(y)})" fill="var(--g-capsule)"/>`;
  }
  s += arterioles();
  s += `<g><circle cx="${CX}" cy="${CY}" r="40" fill="var(--g-mes)"/>`;
  for (const [x, y] of LOOPS) {
    const mx = CX + (x - CX) * 0.42, my = CY + (y - CY) * 0.42;
    const rot = (Math.atan2(y - CY, x - CX) * 180) / Math.PI;
    s += `<ellipse cx="${f1(mx)}" cy="${f1(my)}" rx="34" ry="20" transform="rotate(${f1(rot)} ${f1(mx)} ${f1(my)})" fill="var(--g-mes)"/>`;
  }
  s += `<circle cx="${CX - 12}" cy="${CY - 6}" r="4" fill="var(--g-nucleus)"/><circle cx="${CX + 13}" cy="${CY + 8}" r="4" fill="var(--g-nucleus)"/>`;
  s += '</g>';
  LOOPS.forEach(([x, y], li) => {
    const out = outward([x, y]);
    s += `<circle cx="${x}" cy="${y}" r="${R - 3.5}" fill="var(--g-lumen)"/>`;
    s += `<ellipse cx="${x - 14}" cy="${y + 10}" rx="7" ry="4" fill="var(--g-rbc)" transform="rotate(${20 + li * 30} ${x - 14} ${y + 10})"/>`;
    s += `<ellipse cx="${x + 12}" cy="${y - 14}" rx="7" ry="4" fill="var(--g-rbc)" transform="rotate(${-30 + li * 25} ${x + 12} ${y - 14})"/>`;
    s += `<circle cx="${x}" cy="${y}" r="${R - 2}" fill="none" stroke="var(--g-endo)" stroke-width="2.6" stroke-dasharray="7 2.5"/>`;
    s += `<circle cx="${x}" cy="${y}" r="${R + 2}" fill="none" stroke="var(--g-gbm)" stroke-width="3.4"/>`;
    // foot processes: separate pedicels with slits between them
    for (const a of urinaryAngles([x, y], 22)) {
      const [px, py] = pol(x, y, R + 6.5, a);
      s += `<circle cx="${f1(px)}" cy="${f1(py)}" r="3.4" fill="var(--g-podo)"/>`;
    }
    for (const d of [-0.55, 0.55]) {
      const [px, py] = pol(x, y, R + 15, out + d);
      const rot = ((out + d) * 180) / Math.PI + 90;
      s += `<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="12" ry="7" transform="rotate(${f1(rot)} ${f1(px)} ${f1(py)})" fill="var(--g-podo)"/>`;
      s += `<circle cx="${f1(px)}" cy="${f1(py)}" r="3" fill="var(--g-nucleus)"/>`;
    }
  });
  s += '</g>';
  return s;
}

// ---------------------------------------------------------------------------
const DEP_COLOR = { IC: 'var(--g-dep-ic)', C3: 'var(--g-dep-c3)' };

function layer(name, title, inner) {
  return `<g data-layer="${name}" tabindex="-1"><title>${title}</title>${inner}</g>`;
}

function circulatingGlyphs(kind) {
  const [x, y] = LOOPS[0];
  const spots = [[-18, -14], [6, -24], [-24, 12], [16, 16], [0, 2]];
  let s = '';
  switch (kind) {
    case 'factor':
      // circulating permeability factor / anti-nephrin antibodies (T-cell derived)
      spots.forEach(([dx, dy], i) => { s += antibody(x + dx, y + dy, 'var(--g-factor)', i * 47, 0.95); });
      for (const a of urinaryAngles([x, y], 4)) {
        const [px, py] = pol(x, y, R + 3, a);
        s += antibody(px, py, 'var(--g-factor)', (a * 180) / Math.PI + 90, 0.8);
      }
      break;
    case 'pla2r':
      // anti-PLA2R IgG4 crosses the GBM and binds the antigen on the podocyte sole
      spots.forEach(([dx, dy], i) => { s += antibody(x + dx, y + dy, 'var(--g-dep-igg)', i * 50); });
      for (const a of urinaryAngles([x, y], 5)) {
        const [px, py] = pol(x, y, R + 5, a);
        s += antibody(px, py, 'var(--g-dep-igg)', (a * 180) / Math.PI + 90, 0.85);
      }
      break;
    case 'ic':
      spots.forEach(([dx, dy], i) => {
        s += antibody(x + dx, y + dy, 'var(--g-dep-ic)', i * 40);
        s += `<circle cx="${f1(x + dx)}" cy="${f1(y + dy - 6)}" r="2.4" fill="var(--g-dep-ic)"/>`;
      });
      break;
    case 'c3nef':
      spots.forEach(([dx, dy]) => { s += `<path d="M${x + dx} ${y + dy - 4} l4 7 h-8 z" fill="var(--g-dep-c3)" stroke="var(--g-c3-edge)" stroke-width="0.8"/>`; });
      s += `<text x="${x}" y="${y + 30}" text-anchor="middle" class="g-tag">C3NeF</text>`;
      break;
    case 'glucose':
      spots.forEach(([dx, dy]) => {
        const pts = Array.from({ length: 6 }, (_, k) => pol(x + dx, y + dy, 4.5, (k * Math.PI) / 3)).map(([a, b]) => `${f1(a)},${f1(b)}`).join(' ');
        s += `<polygon points="${pts}" fill="none" stroke="var(--g-glucose)" stroke-width="1.6"/>`;
      });
      break;
    case 'lightChains':
      spots.forEach(([dx, dy], i) => { s += `<path d="M${x + dx} ${y + dy} l7 ${i % 2 ? -3 : 3}" stroke="var(--g-amyloid-edge)" stroke-width="3" stroke-linecap="round"/>`; });
      s += `<text x="${x}" y="${y + 32}" text-anchor="middle" class="g-tag">λ</text>`;
      break;
    case 'hiv': {
      const [px, py] = pol(x, y, R + 15, outward([x, y]) - 0.55);
      for (const [dx, dy] of [[-6, -4], [5, 3], [0, 8]]) {
        s += `<circle cx="${f1(px + dx)}" cy="${f1(py + dy)}" r="3.2" fill="none" stroke="var(--g-virus)" stroke-width="1.4"/>`;
        for (let k = 0; k < 6; k++) {
          const [a1, b1] = pol(px + dx, py + dy, 3.2, (k * Math.PI) / 3);
          const [a2, b2] = pol(px + dx, py + dy, 5, (k * Math.PI) / 3);
          s += `<line x1="${f1(a1)}" y1="${f1(b1)}" x2="${f1(a2)}" y2="${f1(b2)}" stroke="var(--g-virus)" stroke-width="1"/>`;
        }
      }
      break;
    }
    case 'genetic': {
      // mutated slit-diaphragm / podocyte proteins: a double helix on each podocyte body
      for (const loop of LOOPS) {
        const [px, py] = pol(loop[0], loop[1], R + 15, outward(loop) + 0.55);
        let h = '';
        let a = '', b = '';
        for (let k = 0; k <= 12; k++) {
          const xx = px - 12 + k * 2;
          const yy = 5 * Math.sin(k * 0.7);
          a += `${k ? 'L' : 'M'}${f1(xx)} ${f1(py - yy)} `;
          b += `${k ? 'L' : 'M'}${f1(xx)} ${f1(py + yy)} `;
          if (k % 2 === 0) h += `<line x1="${f1(xx)}" y1="${f1(py - yy)}" x2="${f1(xx)}" y2="${f1(py + yy)}" stroke="var(--g-gene)" stroke-width="1"/>`;
        }
        h += `<path d="${a}" stroke="var(--g-gene)" stroke-width="1.8" fill="none"/><path d="${b}" stroke="var(--g-gene)" stroke-width="1.8" fill="none"/>`;
        s += h;
      }
      break;
    }
    case 'hyperfiltration':
      // dilated afferent arteriole, high flow and pressure into a large glomerulus
      s += '<path d="M184 -30 L184 112" stroke="var(--g-art)" stroke-width="32" stroke-linecap="round" fill="none"/>';
      s += '<path d="M184 -30 L184 112" stroke="var(--g-lumen)" stroke-width="24" stroke-linecap="round" fill="none"/>';
      for (const yy of [-14, 24, 62]) s += `<path d="M184 ${yy} l0 18 m-6 -7 l6 7 l6 -7" stroke="var(--g-flow)" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      s += `<ellipse cx="${CX}" cy="${CY}" rx="${CAP.rx + 4}" ry="${CAP.ry + 4}" fill="none" stroke="var(--g-flow)" stroke-width="1.5" stroke-dasharray="5 5"/>`;
      break;
    default: break;
  }
  return s;
}

function effacementLayer(kind) {
  let c = '';
  LOOPS.forEach((loop, i) => {
    if (kind === 'segmental' && (i === 2 || i === 3)) return;
    const out = outward(loop);
    const span = kind === 'segmental' ? 1.0 : 2.25;
    c += `<path d="${arcPath(loop[0], loop[1], R + 6.5, out - span, out + span)}" stroke="var(--g-podo)" stroke-width="8" fill="none" stroke-linecap="round"/>`;
    c += `<path d="${arcPath(loop[0], loop[1], R + 6.5, out - span, out + span)}" stroke="var(--g-podo-edge)" stroke-width="1" fill="none" stroke-dasharray="1 9"/>`;
  });
  return c;
}

function mnLayers(stage, t) {
  let dep = '', spikes = '', thick = '';
  LOOPS.forEach((loop) => {
    const [x, y] = loop;
    const angs = urinaryAngles(loop, 11, 2.3);
    if (stage >= 3) {
      // GBM grows around the deposits: a thick band
      thick += `<circle cx="${x}" cy="${y}" r="${R + 4}" fill="none" stroke="var(--g-gbm)" stroke-width="${stage === 4 ? 10 : 8}"/>`;
    }
    angs.forEach((a, k) => {
      if (stage === 4) {
        const [px, py] = pol(x, y, R + 4, a);
        if (k % 2 === 0) thick += `<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="2.4" ry="1.6" transform="rotate(${f1((a * 180) / Math.PI + 90)} ${f1(px)} ${f1(py)})" fill="var(--g-bowman)"/>`;
        return;
      }
      const r = stage === 3 ? R + 4 : R + 5.6;
      const [px, py] = pol(x, y, r, a);
      const size = stage === 3 ? 2.6 : 3.4;
      dep += `<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="${size}" ry="${size * 0.75}" transform="rotate(${f1((a * 180) / Math.PI + 90)} ${f1(px)} ${f1(py)})" fill="var(--g-dep-igg)" stroke="var(--g-igg-edge)" stroke-width="0.6"/>`;
      if (stage === 2 && k < angs.length - 1) {
        const am = (a + angs[k + 1]) / 2;
        const [s0x, s0y] = pol(x, y, R + 3.5, am);
        const [s1x, s1y] = pol(x, y, R + 9, am);
        spikes += `<line x1="${f1(s0x)}" y1="${f1(s0y)}" x2="${f1(s1x)}" y2="${f1(s1y)}" stroke="var(--g-gbm)" stroke-width="2" stroke-linecap="round"/>`;
      }
    });
  });
  let s = '';
  if (thick) s += layer('gbmThick', t('gbmThick'), thick);
  if (dep) s += layer('subepi', t('subepi'), dep);
  if (spikes) s += layer('spikes', t('spikes'), spikes);
  return s;
}

/**
 * opts: { titles: {layerKey: text}, stage (MN 1-4), idPrefix, label }
 */
export function renderGlomerulus(entity, opts = {}) {
  const v = entity.visual;
  const T = opts.titles || {};
  const t = (k) => T[k] || k;
  const rnd = seeded(11);
  let s = anatomy();

  if (v.lobular) {
    let c = `<circle cx="${CX}" cy="${CY}" r="50" fill="var(--g-mes)" opacity="0.95"/>`;
    for (const [x, y] of LOOPS) {
      const mx = CX + (x - CX) * 0.5, my = CY + (y - CY) * 0.5;
      const rot = (Math.atan2(y - CY, x - CX) * 180) / Math.PI;
      c += `<ellipse cx="${f1(mx)}" cy="${f1(my)}" rx="40" ry="24" transform="rotate(${f1(rot)} ${f1(mx)} ${f1(my)})" fill="var(--g-mes)"/>`;
    }
    [[-22, -18], [20, -20], [-26, 16], [24, 20], [0, -30], [2, 30], [-34, 0], [34, -2], [-46, -30], [46, 32], [-44, 34], [44, -32]].forEach(([dx, dy]) => {
      c += `<circle cx="${CX + dx}" cy="${CY + dy}" r="4.2" fill="var(--g-nucleus)"/>`;
    });
    s += layer('lobular', t('lobular'), c);
  }

  if (v.kw) {
    let c = '';
    [[-15, -4, 14], [17, 12, 12], [2, -30, 9]].forEach(([dx, dy, r]) => {
      c += `<circle cx="${CX + dx}" cy="${CY + dy}" r="${r}" fill="var(--g-kw)" stroke="var(--g-kw-edge)" stroke-width="1"/>`;
      c += `<circle cx="${CX + dx}" cy="${CY + dy}" r="${r - 5}" fill="none" stroke="var(--g-kw-edge)" stroke-width="0.8" opacity="0.7"/>`;
    });
    s += layer('kw', t('kw'), c);
  }

  if (v.amyloid) {
    let c = '';
    for (let k = 0; k < 14; k++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 34;
      c += `<ellipse cx="${f1(CX + d * Math.cos(a))}" cy="${f1(CY + d * Math.sin(a))}" rx="${f1(7 + rnd() * 6)}" ry="${f1(5 + rnd() * 4)}" fill="var(--g-amyloid)" opacity="0.9"/>`;
    }
    for (const [x, y] of LOOPS) {
      c += `<circle cx="${x}" cy="${y}" r="${R + 1}" fill="none" stroke="var(--g-amyloid)" stroke-width="7" opacity="0.85"/>`;
      for (let k = 0; k < 10; k++) {
        const a = rnd() * Math.PI * 2;
        const [px, py] = pol(x, y, R + 1 + (rnd() - 0.5) * 5, a);
        c += `<line x1="${f1(px)}" y1="${f1(py)}" x2="${f1(px + (rnd() - 0.5) * 7)}" y2="${f1(py + (rnd() - 0.5) * 7)}" stroke="var(--g-amyloid-edge)" stroke-width="0.8"/>`;
      }
    }
    s += layer('amyloid', t('amyloid'), c);
  }

  if (v.mesangial) {
    const col = DEP_COLOR[v.mesangial] || DEP_COLOR.IC;
    let c = '';
    [[-14, -22], [10, -26], [-28, -4], [26, 4], [-10, 22], [14, 26], [0, -8], [-4, 10], [22, -12]].forEach(([dx, dy], i) => {
      c += `<ellipse cx="${CX + dx}" cy="${CY + dy}" rx="5" ry="3.3" transform="rotate(${i * 37} ${CX + dx} ${CY + dy})" fill="${col}"/>`;
    });
    s += layer('mesangial', t('mesangial'), c);
  }

  if (v.doubleContour) {
    let c = '';
    LOOPS.forEach(([x, y]) => { c += `<circle cx="${x}" cy="${y}" r="${R - 6}" fill="none" stroke="var(--g-gbm)" stroke-width="2" stroke-dasharray="6 3"/>`; });
    s += layer('doubleContour', t('doubleContour'), c);
  }

  if (v.subendo) {
    let c = '';
    LOOPS.forEach(([x, y]) => {
      for (let k = 0; k < 6; k++) {
        const a = k * 1.05 + 0.3;
        const [px, py] = pol(x, y, R - 0.5, a);
        c += `<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="4" ry="2.2" transform="rotate(${f1((a * 180) / Math.PI + 90)} ${f1(px)} ${f1(py)})" fill="var(--g-dep-ic)"/>`;
      }
    });
    s += layer('subendo', t('subendo'), c);
  }

  if (v.c3dep) {
    let c = '';
    LOOPS.forEach(([x, y]) => {
      for (const a0 of [0.3, 1.9, 3.5, 5.1]) c += `<path d="${arcPath(x, y, R + 0.5, a0, a0 + 0.7)}" stroke="var(--g-dep-c3)" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
    });
    s += layer('c3dep', t('c3dep'), c);
  }

  if (v.dense) {
    let c = '';
    LOOPS.forEach(([x, y]) => {
      for (const a0 of [0.2, 2.2, 4.2]) c += `<path d="${arcPath(x, y, R + 2, a0, a0 + 1.3)}" stroke="var(--g-dense)" stroke-width="6.5" fill="none" stroke-linecap="round"/>`;
    });
    s += layer('dense', t('dense'), c);
  }

  if (v.gbmThick) {
    let c = '';
    LOOPS.forEach(([x, y]) => { c += `<circle cx="${x}" cy="${y}" r="${R + 2.5}" fill="none" stroke="var(--g-gbm)" stroke-width="${3.4 + 3 * v.gbmThick}"/>`; });
    s += layer('gbmThick', t('gbmThick'), c);
  }

  if (v.effacement) s += layer('effacement', t('effacement'), effacementLayer(v.effacement));

  if (v.subepi) s += mnLayers(opts.stage || 2, t);

  if (v.sclerosis) {
    const li = v.sclerosis === 'perihilar' ? 0 : 1;
    const [x, y] = LOOPS[li];
    const out = outward([x, y]);
    let c = `<circle cx="${x}" cy="${y}" r="${R + 4}" fill="var(--g-scar)" stroke="var(--g-gbm)" stroke-width="2.4" stroke-dasharray="3 2"/>`;
    for (let k = 0; k < 7; k++) {
      const [px, py] = pol(x, y, 10 + rnd() * 26, rnd() * Math.PI * 2);
      c += `<path d="M${f1(px - 8)} ${f1(py)} q8 ${f1((rnd() - 0.5) * 8)} 16 0" stroke="var(--g-scar-line)" stroke-width="0.9" fill="none"/>`;
    }
    c += `<ellipse cx="${x - 10}" cy="${y + 6}" rx="16" ry="11" fill="var(--g-hyaline)" stroke="var(--g-hyaline-edge)" stroke-width="1"/>`;
    c += `<circle cx="${x + 14}" cy="${y - 12}" r="5" fill="var(--g-lumen)"/>`;
    // synechia: adhesion of the sclerosed segment to Bowman's capsule
    const [ax, ay] = pol(x, y, R + 4, out);
    const [bx, by] = [CX + (CAP.rx - 16) * Math.cos(out), CY + (CAP.ry - 16) * Math.sin(out)];
    c += `<path d="M${f1(ax)} ${f1(ay)} L${f1(bx)} ${f1(by)}" stroke="var(--g-scar)" stroke-width="22" stroke-linecap="round"/>`;
    c += `<path d="M${f1(ax)} ${f1(ay)} L${f1(bx)} ${f1(by)}" stroke="var(--g-scar-line)" stroke-width="1" stroke-dasharray="3 3"/>`;
    s += layer('sclerosis', t('sclerosis'), c);
  }

  if (v.collapse) {
    let c = '';
    for (const li of [1, 3]) {
      const [x, y] = LOOPS[li];
      c += `<circle cx="${x}" cy="${y}" r="${R + 6}" fill="var(--g-bowman)"/>`;
      let d = '';
      for (let k = 0; k <= 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        const r = 26 + 5 * Math.sin(a * 7);
        const [px, py] = pol(x, y, r, a);
        d += `${k ? 'L' : 'M'}${f1(px)} ${f1(py)} `;
      }
      c += `<path d="${d}Z" fill="var(--g-lumen)" stroke="var(--g-gbm)" stroke-width="3"/>`;
      // hyperplastic, hypertrophic podocytes crowding Bowman's space
      for (let k = 0; k < 9; k++) {
        const a = outward([x, y]) - 2 + (4 * k) / 8;
        const [px, py] = pol(x, y, 40 + (k % 2) * 8, a);
        c += `<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="9" ry="7" fill="var(--g-podo)" stroke="var(--g-podo-edge)" stroke-width="0.8"/><circle cx="${f1(px)}" cy="${f1(py)}" r="3" fill="var(--g-nucleus)"/>`;
      }
    }
    s += layer('collapse', t('collapse'), c);
  }

  if (v.hyaline) {
    let c = '';
    for (const [x, w] of [[184, 9], [216, 6.5]]) {
      c += `<path d="M${x} -26 L${x} 108" stroke="var(--g-hyaline)" stroke-width="${w * 2 + 10}" stroke-linecap="round" fill="none"/>`;
      c += `<path d="M${x} -26 L${x} 108" stroke="var(--g-lumen)" stroke-width="${w * 0.9}" stroke-linecap="round" fill="none"/>`;
    }
    s += layer('hyaline', t('hyaline'), c);
  }

  if (v.circulating) s += layer('circulating', t('circulating'), circulatingGlyphs(v.circulating));

  const label = opts.label ? ` aria-label="${opts.label}"` : '';
  return `<svg viewBox="0 -34 400 398" class="glom" role="img"${label}>${s}</svg>`;
}

/** Layers actually drawn for an entity, in pathogenic order. */
export function layersOf(entity, stage = 2) {
  const v = entity.visual;
  const out = [];
  if (v.circulating) out.push('circulating');
  if (v.effacement) out.push('effacement');
  if (v.subepi) {
    if (stage <= 3) out.push('subepi');
    if (stage === 2) out.push('spikes');
    if (stage >= 3) out.push('gbmThick');
  }
  if (v.mesangial) out.push('mesangial');
  if (v.subendo) out.push('subendo');
  if (v.c3dep) out.push('c3dep');
  if (v.dense) out.push('dense');
  if (v.lobular) out.push('lobular');
  if (v.doubleContour) out.push('doubleContour');
  if (v.sclerosis) out.push('sclerosis');
  if (v.collapse) out.push('collapse');
  if (v.gbmThick) out.push('gbmThick');
  if (v.kw) out.push('kw');
  if (v.hyaline) out.push('hyaline');
  if (v.amyloid) out.push('amyloid');
  return out;
}

export const ANAT = ['lumen', 'endothelium', 'gbm', 'podocyte', 'mesangium', 'bowman', 'arterioles'];

const SWATCH = {
  lumen: 'var(--g-lumen)', endothelium: 'var(--g-endo)', gbm: 'var(--g-gbm)', podocyte: 'var(--g-podo)',
  mesangium: 'var(--g-mes)', bowman: 'var(--g-capsule)', arterioles: 'var(--g-art)',
  effacement: 'var(--g-podo)', subepi: 'var(--g-dep-igg)', spikes: 'var(--g-gbm)', gbmThick: 'var(--g-gbm)',
  mesangial: 'var(--g-dep-ic)', subendo: 'var(--g-dep-ic)', c3dep: 'var(--g-dep-c3)', dense: 'var(--g-dense)',
  lobular: 'var(--g-nucleus)', doubleContour: 'var(--g-gbm)', sclerosis: 'var(--g-scar)', collapse: 'var(--g-podo-edge)',
  kw: 'var(--g-kw)', hyaline: 'var(--g-hyaline)', amyloid: 'var(--g-amyloid)',
};
const CIRC = {
  factor: 'var(--g-factor)', pla2r: 'var(--g-dep-igg)', ic: 'var(--g-dep-ic)', c3nef: 'var(--g-dep-c3)', glucose: 'var(--g-glucose)',
  lightChains: 'var(--g-amyloid-edge)', hiv: 'var(--g-virus)', genetic: 'var(--g-gene)', hyperfiltration: 'var(--g-flow)',
};

export function swatchFor(entity, key) {
  if (key === 'circulating') return CIRC[entity.visual.circulating];
  if (key === 'mesangial') return DEP_COLOR[entity.visual.mesangial] || DEP_COLOR.IC;
  return SWATCH[key];
}

// ---------------------------------------------------------------------------
// Immunofluorescence panel (dark field, FITC green) — Congo red under
// polarised light for amyloid.
const ICX = 80, ICY = 82, IR = 19;
const ILOOPS = [[54, 58], [106, 58], [54, 106], [106, 106]];

export function renderIF(pattern, opts = {}) {
  const rnd = seeded(7);
  const id = opts.idPrefix || 'if';
  let s = `<defs><filter id="${id}-b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  s += `<rect width="160" height="164" rx="10" fill="#050806"/>`;
  s += `<ellipse cx="${ICX}" cy="${ICY}" rx="72" ry="70" fill="none" stroke="#1a2a1c" stroke-width="2"/>`;
  for (const [x, y] of ILOOPS) s += `<circle cx="${x}" cy="${y}" r="${IR}" fill="none" stroke="#132015" stroke-width="2"/>`;
  const G = pattern === 'congo' ? '#b8f05a' : '#6cf47a';
  let p = '';
  const dotsOnLoops = (n, r, jitter, loops = ILOOPS) => {
    for (const [x, y] of loops) for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd() * 0.3;
      const rr = IR + (rnd() - 0.5) * jitter;
      p += `<circle cx="${f1(x + rr * Math.cos(a))}" cy="${f1(y + rr * Math.sin(a))}" r="${f1(r * (0.7 + rnd() * 0.6))}" fill="${G}"/>`;
    }
  };
  const mesBlobs = (n, r) => {
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 22;
      const x = ICX + d * Math.cos(a), y = ICY + d * Math.sin(a);
      p += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r * (0.8 + rnd() * 0.6))}" ry="${f1(r * 0.6)}" fill="${G}" transform="rotate(${Math.round(rnd() * 180)} ${f1(x)} ${f1(y)})"/>`;
    }
  };
  switch (pattern) {
    case 'segmentalIgM': {
      // IgM and C3 trapped in the sclerosed segment only
      const [x, y] = ILOOPS[1];
      p += `<circle cx="${x}" cy="${y}" r="${IR - 3}" fill="${G}" opacity="0.55"/>`;
      for (let k = 0; k < 8; k++) p += `<circle cx="${f1(x + (rnd() - 0.5) * 24)}" cy="${f1(y + (rnd() - 0.5) * 24)}" r="${f1(2 + rnd() * 2)}" fill="${G}"/>`;
      mesBlobs(3, 1.6);
      break;
    }
    case 'granularCapillary':
      dotsOnLoops(26, 1.4, 1.6);
      break;
    case 'granularSecondary':
      dotsOnLoops(22, 1.5, 2);
      mesBlobs(9, 2.2);
      break;
    case 'mpgnGranular':
      dotsOnLoops(16, 2.2, 3);
      for (const [x, y] of ILOOPS) p += `<path d="${arcPath(x, y, IR, 0.6, 1.9)}" stroke="${G}" stroke-width="3" fill="none"/>`;
      mesBlobs(7, 2.4);
      break;
    case 'c3only':
      for (const [x, y] of ILOOPS) for (const a0 of [0.2, 1.8, 3.4, 5.0]) p += `<path d="${arcPath(x, y, IR, a0, a0 + 0.9)}" stroke="${G}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
      mesBlobs(7, 2.2);
      break;
    case 'linearAlbumin':
      for (const [x, y] of ILOOPS) p += `<circle cx="${x}" cy="${y}" r="${IR}" fill="none" stroke="${G}" stroke-width="1.6" opacity="0.7"/>`;
      p += `<ellipse cx="${ICX}" cy="${ICY}" rx="66" ry="64" fill="none" stroke="${G}" stroke-width="1" opacity="0.5"/>`;
      break;
    case 'congo':
      // apple-green birefringence in mesangium and capillary walls
      for (const [x, y] of ILOOPS) {
        for (let k = 0; k < 6; k++) {
          const a = rnd() * Math.PI * 2;
          p += `<path d="${arcPath(x, y, IR + (rnd() - 0.5) * 3, a, a + 0.5 + rnd() * 0.4)}" stroke="${G}" stroke-width="${f1(1.5 + rnd() * 1.5)}" fill="none" opacity="0.85"/>`;
        }
      }
      for (let k = 0; k < 10; k++) {
        const a = rnd() * Math.PI * 2, d = rnd() * 18;
        const x = ICX + d * Math.cos(a), y = ICY + d * Math.sin(a);
        p += `<path d="M${f1(x)} ${f1(y)} q${f1((rnd() - 0.5) * 12)} ${f1((rnd() - 0.5) * 12)} ${f1((rnd() - 0.5) * 16)} ${f1((rnd() - 0.5) * 16)}" stroke="${G}" stroke-width="2" fill="none" opacity="0.8"/>`;
      }
      break;
    case 'negative':
    default:
      mesBlobs(2, 1);
      p = p.replace(/fill="#6cf47a"/g, 'fill="#6cf47a" opacity="0.25"');
      break;
  }
  s += `<g filter="url(#${id}-b)" opacity="0.95">${p}</g>`;
  const label = opts.label ? ` aria-label="${opts.label}"` : '';
  return `<svg viewBox="0 0 160 164" class="ifsvg" role="img"${label}>${s}</svg>`;
}
