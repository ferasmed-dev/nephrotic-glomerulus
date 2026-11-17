// Rotatable 3D segment of a glomerular capillary loop, drawn on a <canvas>
// with a tiny painter's-algorithm renderer (no libraries). Shows the GBM
// tube, the interdigitating podocyte foot processes and each entity's lesion.

const TAU = Math.PI * 2;
const L = 1.8; // half-length of the capillary segment

function seeded(n) {
  let a = n;
  return () => { a = (a * 9301 + 49297) % 233280; return a / 233280; };
}

function hexToRgb(h) {
  const s = h.trim().replace('#', '');
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function palette(el) {
  const cs = getComputedStyle(el);
  const g = (k, fb) => {
    const v = cs.getPropertyValue(k).trim();
    return /^#[0-9a-f]{3,6}$/i.test(v) ? hexToRgb(v) : hexToRgb(fb);
  };
  return {
    bg: g('--g-bowman', '#f6f1e7'), gbm: g('--g-gbm', '#5d6b8a'), gbmIn: g('--g-lumen', '#fbe3e1'),
    podo: g('--g-podo', '#c2b3e6'), podo2: g('--g-podo2', '#a18fd6'), nucleus: g('--g-nucleus', '#5a3f7a'),
    dep: g('--g-dep-igg', '#12a35a'), ic: g('--g-dep-ic', '#eb6834'), c3: g('--g-dep-c3', '#eda100'),
    dense: g('--g-dense', '#3d3326'), amyloid: g('--g-amyloid-edge', '#c0704f'), hyaline: g('--g-hyaline', '#f0b9c9'),
    rbc: g('--g-rbc', '#d9534f'),
  };
}

/** Builds the primitives (in model space) for an entity. */
export function buildScene(entity, { stage = 2, showPodocytes = true } = {}) {
  const v = entity.visual;
  const rnd = seeded(9);
  const prims = [];
  const NA = 22, NT = 36;
  const collapse = !!v.collapse;
  const thick = (v.gbmThick ? 0.1 * v.gbmThick : 0) + (v.subepi && stage >= 3 ? 0.08 : 0) + (v.amyloid ? 0.06 : 0);
  const rg = (th) => (collapse ? 0.72 + 0.1 * Math.sin(th * 7) : 1);
  const rOut = (th) => rg(th) + thick;
  const ringPt = (x, th, r) => [x, r * Math.cos(th), r * Math.sin(th)];
  const sclerosed = (x, th) => v.sclerosis && x > 0.8 && Math.cos(th - 1.2) > 0.5;

  // GBM tube (outer face) + inner face
  for (let i = 0; i < NA; i++) {
    const x0 = -L + (2 * L * i) / NA, x1 = -L + (2 * L * (i + 1)) / NA;
    for (let j = 0; j < NT; j++) {
      const t0 = (TAU * j) / NT, t1 = (TAU * (j + 1)) / NT, tm = (t0 + t1) / 2;
      const col = v.dense ? 'dense' : 'gbm';
      prims.push({ type: 'quad', pts: [ringPt(x0, t0, rOut(t0)), ringPt(x1, t0, rOut(t0)), ringPt(x1, t1, rOut(t1)), ringPt(x0, t1, rOut(t1))], n: [0, Math.cos(tm), Math.sin(tm)], col, back: 'gbmIn' });
      if (v.subepi && stage === 4 && (i + j) % 5 === 0) {
        prims.push({ type: 'dot', p: ringPt((x0 + x1) / 2, tm, rOut(tm) + 0.005), r: 0.035, col: 'gbmIn', n: [0, Math.cos(tm), Math.sin(tm)] });
      }
      if (sclerosed((x0 + x1) / 2, tm) && (i + j) % 4 === 0) {
        prims.push({ type: 'dot', p: ringPt((x0 + x1) / 2, tm, rOut(tm) + 0.04), r: 0.07, col: 'hyaline', n: [0, Math.cos(tm), Math.sin(tm)] });
      }
    }
  }
  // double contour (MPGN): a second, inner basement membrane ring set
  if (v.doubleContour) {
    for (let i = 0; i <= NA; i += 2) {
      const x = -L + (2 * L * i) / NA;
      prims.push({ type: 'ring', x, r: 0.84, col: 'gbm' });
    }
  }
  // subendothelial / C3 deposits on the inner face (seen through the open ends)
  if (v.subendo || v.c3dep) {
    for (let k = 0; k < 90; k++) {
      const th = rnd() * TAU, x = -L + rnd() * 2 * L;
      prims.push({ type: 'dot', p: ringPt(x, th, 0.94), r: 0.05, col: v.c3dep ? 'c3' : 'ic', n: [0, -Math.cos(th), -Math.sin(th)] });
    }
  }
  // red cells in the lumen
  for (const x of [-0.9, 0.4, 1.3]) prims.push({ type: 'dot', p: [x, 0.15 * Math.sin(x * 3), 0.1], r: 0.26, col: 'rbc', flat: true });

  // subepithelial deposits (MN) and spikes
  if (v.subepi && stage <= 3) {
    for (let i = 0; i < NA; i++) {
      for (let j = 0; j < NT; j++) {
        if ((i * 7 + j * 3) % 2) continue;
        const x = -L + (2 * L * (i + 0.5)) / NA, th = (TAU * (j + 0.5)) / NT;
        const r = stage === 3 ? rOut(th) - 0.01 : rOut(th) + 0.035;
        prims.push({ type: 'dot', p: ringPt(x, th, r), r: stage === 1 ? 0.035 : 0.05, col: 'dep', n: [0, Math.cos(th), Math.sin(th)] });
        if (stage === 2) {
          const th2 = th + TAU / NT / 2;
          prims.push({ type: 'line', a: ringPt(x, th2, rOut(th2)), b: ringPt(x, th2, rOut(th2) + 0.11), col: 'gbm', w: 2.2 });
        }
      }
    }
  }
  // amyloid fibrils and spicules
  if (v.amyloid) {
    for (let k = 0; k < 420; k++) {
      const th = rnd() * TAU, x = -L + rnd() * 2 * L;
      const r = rOut(th) + rnd() * 0.06;
      prims.push({ type: 'line', a: ringPt(x, th, r), b: ringPt(x + (rnd() - 0.5) * 0.14, th + (rnd() - 0.5) * 0.12, r + rnd() * 0.08), col: 'amyloid', w: 1.2 });
    }
  }

  if (showPodocytes) {
    const effaced = (x) => v.effacement === 'diffuse' || (v.effacement === 'segmental' && x < 0);
    const rp = (th) => rOut(th) + (v.subepi && stage <= 2 ? 0.12 : 0.06);
    const NP = 48, NX = 30;
    for (let i = 0; i < NX; i++) {
      const x0 = -L + (2 * L * i) / NX, x1 = -L + (2 * L * (i + 1)) / NX, xm = (x0 + x1) / 2;
      for (let j = 0; j < NP; j++) {
        const t0 = (TAU * j) / NP, t1 = (TAU * (j + 1)) / NP, tm = (t0 + t1) / 2;
        if (sclerosed(xm, tm)) continue; // podocyte detached: bare GBM
        if (effaced(xm)) {
          // flattened, fused sheet without slits (drawn on a coarser grid)
          if (i % 2 || j % 2) continue;
          const x2 = Math.min(L, x0 + (4 * L) / NX), t2 = t0 + (2 * TAU) / NP, tc = (t0 + t2) / 2;
          prims.push({ type: 'quad', pts: [ringPt(x0, t0, rp(t0)), ringPt(x2, t0, rp(t0)), ringPt(x2, t2, rp(t2)), ringPt(x0, t2, rp(t2))], n: [0, Math.cos(tc), Math.sin(tc)], col: 'podo', back: 'podo' });
        } else {
          // separate pedicels: narrower than the cell, alternating podocytes, slits between them
          const g = 0.3 * (t1 - t0);
          const a0 = t0 + g / 2, a1 = t1 - g / 2;
          const r = rp(tm) + 0.02;
          prims.push({ type: 'quad', pts: [ringPt(x0 + 0.01, a0, r), ringPt(x1 - 0.01, a0, r), ringPt(x1 - 0.01, a1, r), ringPt(x0 + 0.01, a1, r)], n: [0, Math.cos(tm), Math.sin(tm)], col: j % 2 ? 'podo' : 'podo2', back: 'podo' });
        }
      }
    }
    // cell bodies + primary processes
    const bodies = collapse ? 9 : 3;
    for (let k = 0; k < bodies; k++) {
      const th = (k / bodies) * TAU + 0.6, x = -1.2 + (2.4 * k) / Math.max(1, bodies - 1);
      const rb = collapse ? 1.2 : 1.55;
      prims.push({ type: 'dot', p: ringPt(x, th, rb), r: collapse ? 0.24 : 0.3, col: 'podo', n: [0, Math.cos(th), Math.sin(th)] });
      prims.push({ type: 'dot', p: ringPt(x, th, rb + 0.12), r: 0.09, col: 'nucleus', n: [0, Math.cos(th), Math.sin(th)] });
      for (const d of [-0.5, 0.5]) {
        prims.push({ type: 'line', a: ringPt(x, th, rb - 0.1), b: ringPt(x + d * 0.6, th + d * 0.5, rp(th) + 0.04), col: 'podo', w: 7 });
      }
    }
  }
  return prims;
}

function rotate([x, y, z], yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = cy * x + sy * z, z1 = -sy * x + cy * z;
  const y2 = cp * y - sp * z1, z2 = sp * y + cp * z1;
  return [x1, y2, z2];
}

/** Mounts the viewer. Returns { setEntity, destroy, redraw, state }. */
export function mount3d(canvas, entity, opts = {}) {
  const ctx = canvas.getContext('2d');
  const st = { yaw: -0.75, pitch: 0.45, zoom: 1, stage: opts.stage || 2, showPodocytes: opts.showPodocytes ?? true, auto: false };
  let prims = buildScene(entity, st);
  let pal = palette(canvas);
  let raf = 0;
  const light = (() => { const v = [-0.4, -0.6, 0.7]; const n = Math.hypot(...v); return v.map((c) => c / n); })();

  function shade(rgb, k) { return `rgb(${Math.round(rgb[0] * k)},${Math.round(rgb[1] * k)},${Math.round(rgb[2] * k)})`; }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600, h = canvas.clientHeight || 380;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = shade(pal.bg, 1);
    ctx.fillRect(0, 0, w, h);
    const f = Math.min(w, h * 1.6) * 0.19 * st.zoom;
    const D = 7;
    const proj = (p) => {
      const [x, y, z] = rotate(p, st.yaw, st.pitch);
      const s = D / (D - z);
      return [w / 2 + x * f * s, h / 2 + y * f * s, z, s];
    };
    const items = [];
    for (const q of prims) {
      if (q.type === 'quad') {
        const P = q.pts.map(proj);
        const n = rotate(q.n, st.yaw, st.pitch);
        const facing = n[2] > 0;
        const z = (P[0][2] + P[1][2] + P[2][2] + P[3][2]) / 4;
        const lam = Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
        const col = facing ? pal[q.col] : pal[q.back || q.col];
        items.push({ z, draw: () => {
          ctx.beginPath();
          ctx.moveTo(P[0][0], P[0][1]);
          for (let i = 1; i < 4; i++) ctx.lineTo(P[i][0], P[i][1]);
          ctx.closePath();
          ctx.fillStyle = shade(col, facing ? 0.55 + 0.5 * lam : 0.72);
          ctx.fill();
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        } });
      } else if (q.type === 'dot') {
        const P = proj(q.p);
        const n = q.n ? rotate(q.n, st.yaw, st.pitch) : [0, 0, 1];
        const lam = q.flat ? 0.8 : Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
        items.push({ z: P[2] + 0.02, draw: () => {
          const r = Math.max(1, q.r * f * P[3]);
          const grd = ctx.createRadialGradient(P[0] - r * 0.35, P[1] - r * 0.35, r * 0.1, P[0], P[1], r);
          grd.addColorStop(0, shade(pal[q.col], 1.15 + 0.1 * lam));
          grd.addColorStop(1, shade(pal[q.col], 0.65));
          ctx.beginPath();
          if (q.flat) ctx.ellipse(P[0], P[1], r, r * 0.55, st.yaw, 0, TAU);
          else ctx.arc(P[0], P[1], r, 0, TAU);
          ctx.fillStyle = grd;
          ctx.fill();
        } });
      } else if (q.type === 'line') {
        const A = proj(q.a), B = proj(q.b);
        items.push({ z: (A[2] + B[2]) / 2 + 0.01, draw: () => {
          ctx.beginPath();
          ctx.moveTo(A[0], A[1]);
          ctx.lineTo(B[0], B[1]);
          ctx.strokeStyle = shade(pal[q.col], 0.85);
          ctx.lineWidth = q.w * A[3];
          ctx.lineCap = 'round';
          ctx.stroke();
        } });
      } else if (q.type === 'ring') {
        const pts = [];
        for (let k = 0; k <= 36; k++) pts.push(proj([q.x, q.r * Math.cos((TAU * k) / 36), q.r * Math.sin((TAU * k) / 36)]));
        for (let k = 0; k < 36; k += 2) {
          const A = pts[k], B = pts[k + 1];
          items.push({ z: (A[2] + B[2]) / 2, draw: () => {
            ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
            ctx.strokeStyle = shade(pal[q.col], 0.9); ctx.lineWidth = 2; ctx.stroke();
          } });
        }
      }
    }
    items.sort((a, b) => a.z - b.z);
    for (const it of items) it.draw();
  }

  // interaction
  let drag = null;
  const onDown = (e) => { drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch }; canvas.setPointerCapture?.(e.pointerId); stopAuto(); };
  const onMove = (e) => {
    if (!drag) return;
    st.yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
    st.pitch = Math.max(-1.3, Math.min(1.3, drag.pitch + (e.clientY - drag.y) * 0.01));
    draw();
  };
  const onUp = () => { drag = null; };
  const onKey = (e) => {
    const k = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] }[e.key];
    if (k) { e.preventDefault(); st.yaw += k[0]; st.pitch = Math.max(-1.3, Math.min(1.3, st.pitch + k[1])); draw(); }
    if (e.key === '+' || e.key === '=') { st.zoom = Math.min(2.2, st.zoom * 1.1); draw(); }
    if (e.key === '-') { st.zoom = Math.max(0.6, st.zoom / 1.1); draw(); }
  };
  const onWheel = (e) => { e.preventDefault(); st.zoom = Math.max(0.6, Math.min(2.2, st.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))); draw(); };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('keydown', onKey);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(canvas);
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  const onScheme = () => { pal = palette(canvas); draw(); };
  mq?.addEventListener?.('change', onScheme);

  function tick() { st.yaw += 0.006; draw(); raf = requestAnimationFrame(tick); }
  function startAuto() { if (!st.auto) { st.auto = true; raf = requestAnimationFrame(tick); } }
  function stopAuto() { st.auto = false; cancelAnimationFrame(raf); }

  draw();
  return {
    state: st,
    redraw: draw,
    set(o) { Object.assign(st, o); prims = buildScene(entity, st); draw(); },
    reset() { st.yaw = -0.75; st.pitch = 0.45; st.zoom = 1; draw(); },
    toggleAuto() { if (st.auto) stopAuto(); else startAuto(); return st.auto; },
    destroy() {
      stopAuto(); ro?.disconnect(); mq?.removeEventListener?.('change', onScheme);
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('keydown', onKey); canvas.removeEventListener('wheel', onWheel);
    },
  };
}
