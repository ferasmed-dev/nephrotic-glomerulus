import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../src/model.js';

const all = m.ENTITY_IDS;

test('every entity sits in exactly one branch of the tree', () => {
  const inTree = m.TREE.flatMap((b) => b.ids);
  assert.equal(inTree.length, all.length);
  assert.deepEqual([...inTree].sort(), [...all].sort());
  for (const b of m.TREE) for (const id of b.ids) assert.equal(m.ENTITIES[id].group, b.group);
});

test('typical labs are finite, not negative and inside the display range', () => {
  for (const id of all) {
    const labs = m.typicalLabs(id);
    for (const p of m.PARAMS) {
      const v = labs[p.key];
      assert.ok(Number.isFinite(v), `${id}.${p.key} finite`);
      assert.ok(v >= 0, `${id}.${p.key} not negative`);
      if (p.kind === 'quant' || p.kind === 'sel') assert.ok(v <= p.max, `${id}.${p.key} <= display max`);
    }
  }
});

test('status: cut-offs, children and the selectivity classes', () => {
  assert.equal(m.status('albumin', 4.2), 'normal');
  assert.equal(m.status('albumin', 2.0), 'low');
  assert.equal(m.status('upcr', 0.1), 'normal');
  assert.equal(m.status('upcr', 0.18, 'adult'), 'high');
  assert.equal(m.status('upcr', 0.18, 'child'), 'normal');
  assert.equal(m.status('pla2r', 10), 'normal');
  assert.equal(m.status('pla2r', 14), 'high');
  assert.equal(m.status('sbp', 120, 'adult'), 'normal');
  assert.equal(m.status('sbp', 120, 'child'), 'high');
  assert.equal(m.status('selectivity', 0.05), 'sel');
  assert.equal(m.status('selectivity', 0.15), 'mid');
  assert.equal(m.status('selectivity', 0.4), 'nonsel');
  assert.equal(m.status('edema', 0.3), 'normal');
  assert.equal(m.status('hiv', 1), 'pos');
  assert.equal(m.nephroticCut('adult'), 3.5);
  assert.equal(m.nephroticCut('child'), 2);
});

test('barrier sieve: healthy values', () => {
  const alb = m.sieving('albumin');
  assert.ok(alb > 3e-4 && alb < 1e-3, `albumin sieving ~6e-4, got ${alb}`);
  assert.ok(m.sieving('b2m') > 0.2, 'small proteins pass freely');
  assert.ok(m.sieving('igg') < 1e-5, 'IgG practically does not pass');
  // ordering by size: smaller passes more
  assert.ok(m.sieving('b2m') > m.sieving('albumin'));
  assert.ok(m.sieving('albumin') > m.sieving('transferrin'));
  assert.ok(m.sieving('transferrin') > m.sieving('igg'));
  assert.equal(m.selectivityClass(m.selectivityIndex(m.NORMAL_BARRIER)), 'sel');
});

test('barrier sieve: charge loss makes it selective, structural damage makes it non-selective', () => {
  const charge = { chargeLoss: 0.8, shunt: 1e-5 };
  const shunt = { chargeLoss: 0, shunt: 0.01 };
  assert.ok(m.sieving('albumin', charge) > 10 * m.sieving('albumin'), 'charge loss lets albumin through');
  assert.ok(m.sieving('igg', charge) < 1e-4, 'but not IgG');
  assert.ok(m.selectivityIndex(charge) <= 0.1);
  assert.ok(m.selectivityIndex(shunt) > 0.2);
  // monotonic in each parameter, always within [0, 1]
  let prev = 0;
  for (const c of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const v = m.sieving('albumin', { chargeLoss: c, shunt: 0 });
    assert.ok(v >= prev);
    prev = v;
  }
  for (const b of [{ chargeLoss: -1, shunt: -1 }, { chargeLoss: 5, shunt: 5 }]) {
    for (const id of m.PROTEIN_IDS) {
      const v = m.sieving(id, b);
      assert.ok(v >= 0 && v <= 1 && Number.isFinite(v), `${id} clamps`);
    }
  }
  const comp = m.filtrateComposition({ chargeLoss: 0.5, shunt: 0.004 });
  const sum = Object.values(comp).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 100) < 1e-9);
});

test('only minimal change disease has selective proteinuria', () => {
  for (const id of all) {
    const cls = m.selectivityClass(m.selectivityIndex(m.ENTITIES[id].barrier));
    assert.equal(cls, id === 'mcd' ? 'sel' : 'nonsel', id);
  }
  // IgG share of the filtrate is far lower in MCD than in membranous
  assert.ok(m.filtrateComposition(m.ENTITIES.mcd.barrier).igg < m.filtrateComposition(m.ENTITIES.mn.barrier).igg / 10);
});

test('nephrotic syndrome vs nephrotic-range proteinuria', () => {
  for (const id of all) {
    const prof = m.nephroticProfile(m.typicalLabs(id), m.ageOf(id));
    assert.ok(prof.nephroticRange, `${id} has nephrotic-range proteinuria`);
    if (id === 'fsgsAdaptive') {
      assert.equal(prof.syndrome, false, 'adaptive FSGS: normal albumin, no syndrome');
      assert.equal(prof.edema, false);
    } else assert.equal(prof.syndrome, true, `${id} full syndrome`);
  }
  assert.equal(m.nephroticProfile(m.typicalLabs('mcd'), 'child').pure, true, 'MCD is a pure nephrotic syndrome');
  for (const id of ['fsgsPrimary', 'mn', 'mpgnIC', 'c3gn', 'ddd', 'diabetic']) {
    assert.equal(m.nephroticProfile(m.typicalLabs(id), m.ageOf(id)).pure, false, `${id} impure`);
  }
});

test('complement: low C3 only in the membranoproliferative pattern; C4 low only with immune complexes', () => {
  for (const id of all) {
    const L = m.typicalLabs(id);
    const low = m.status('c3', L.c3) === 'low';
    assert.equal(low, m.ENTITIES[id].group === 'mpgn', `${id} C3`);
  }
  assert.equal(m.status('c4', m.typicalLabs('mpgnIC').c4), 'low');
  assert.equal(m.status('c4', m.typicalLabs('c3gn').c4), 'normal');
  assert.equal(m.status('c4', m.typicalLabs('ddd').c4), 'normal');
});

test('anti-PLA2R: positive in primary, negative in secondary membranous', () => {
  assert.equal(m.status('pla2r', m.typicalLabs('mn').pla2r), 'high');
  assert.equal(m.status('pla2r', m.typicalLabs('mnSecondary').pla2r), 'normal');
});

test('thrombotic risk is highest in membranous nephropathy', () => {
  assert.equal(m.thromboRisk('mn', m.typicalLabs('mn').albumin), 'high');
  assert.equal(m.ENTITIES.mn.keys.thrombosis, 'high');
  assert.equal(m.thromboRisk('fsgsAdaptive', m.typicalLabs('fsgsAdaptive').albumin), 'low');
  assert.equal(m.thromboRisk('mcd', 3.5), 'low');
  const mnAlb = m.typicalLabs('mn').albumin;
  for (const id of all) if (!id.startsWith('mn')) assert.ok(m.typicalLabs(id).atiii >= m.typicalLabs('mn').atiii, `${id} ATIII >= MN`);
  assert.ok(mnAlb < 2.5);
});

test('KDIGO 2021 membranous risk categories', () => {
  assert.equal(m.mnRisk({ egfr: 95, upcr: 2, albumin: 3.6, pla2r: 20 }).risk, 'low');
  assert.equal(m.mnRisk({ egfr: 95, upcr: 5, albumin: 2.8, pla2r: 30, selectivity: 0.15 }).risk, 'moderate');
  assert.equal(m.mnRisk({ egfr: 95, upcr: 5, albumin: 2.8, pla2r: 80 }).risk, 'high');
  assert.equal(m.mnRisk({ egfr: 95, upcr: 5, albumin: 2.2, pla2r: 30 }).risk, 'high');
  assert.equal(m.mnRisk({ egfr: 50, upcr: 4, albumin: 3, pla2r: 20 }).risk, 'high');
  assert.equal(m.mnRisk({ egfr: 95, upcr: 9, albumin: 3, pla2r: 20 }).risk, 'high');
  assert.equal(m.mnRisk({ egfr: 95, upcr: 5, albumin: 2.8, pla2r: 30, rapidDecline: true }).risk, 'veryHigh');
  assert.equal(m.mnRisk(m.typicalLabs('mn')).risk, 'high');
});

test('podocytopathies on treatment: MCD remits fast, FSGS partially, genetic FSGS not at all', () => {
  const wMcd = m.weekOfRemission('mcd');
  assert.ok(wMcd != null && wMcd < m.resistanceWeek('child'), `MCD complete remission before week 4 (got ${wMcd})`);
  assert.equal(m.weekOfRemission('fsgsPrimary'), null);
  const u16 = m.podoUpcr('fsgsPrimary', 16);
  assert.equal(m.remission(u16, m.typicalLabs('fsgsPrimary').upcr, 'adult'), 'partial');
  for (const w of [0, 4, 8, 16]) assert.ok(Math.abs(m.podoUpcr('fsgsGenetic', w) - m.typicalLabs('fsgsGenetic').upcr) < 1e-9, 'genetic: flat');
  // adaptive: RAAS blockade lowers proteinuria ~40 % but not to remission
  const a16 = m.podoUpcr('fsgsAdaptive', 16), a0 = m.podoUpcr('fsgsAdaptive', 0);
  assert.ok(a16 < 0.7 * a0 && a16 > 0.5 * a0);
  // albumin and lipids recover as proteinuria falls; never NaN / negative
  for (const id of ['mcd', 'fsgsPrimary', 'fsgsGenetic', 'fsgsAdaptive']) {
    let prevU = Infinity;
    for (let w = 0; w <= 16; w += 0.5) {
      const L = m.podoLabs(id, w);
      for (const [k, v] of Object.entries(L)) assert.ok(Number.isFinite(v) && v >= 0, `${id} w${w} ${k}`);
      assert.ok(L.upcr <= prevU + 1e-12, `${id} proteinuria never rises`);
      prevU = L.upcr;
    }
  }
  const L3 = m.podoLabs('mcd', 3);
  assert.equal(m.status('albumin', L3.albumin), 'normal');
  assert.equal(L3.edema, 0);
  assert.equal(m.status('chol', L3.chol), 'normal');
});

test('membranous: immunological remission precedes clinical remission after rituximab', () => {
  const ms = m.mnMilestones(1);
  assert.ok(ms.immunological != null && ms.partial != null && ms.complete != null);
  assert.ok(ms.immunological < ms.partial && ms.partial < ms.complete);
  assert.ok(ms.immunological >= 3 && ms.immunological <= 7, `anti-PLA2R negative at 3-7 months (got ${ms.immunological})`);
  assert.ok(ms.complete <= 24);
  // later treatment, later remission
  const late = m.mnMilestones(6);
  assert.ok(late.immunological > ms.immunological);
  // untreated high titre: no remission in 2 years; low titre: spontaneous remission
  const none = m.mnMilestones(null, 125);
  assert.equal(none.immunological, null);
  assert.equal(none.partial, null);
  const low = m.mnMilestones(null, 20);
  assert.ok(low.immunological != null && low.partial != null);
  // trajectories are finite, titre never rises
  const traj = m.mnModel({ txMonth: 1 });
  for (let i = 1; i < traj.month.length; i++) {
    assert.ok(traj.pla2r[i] <= traj.pla2r[i - 1] + 1e-12);
    assert.ok(Number.isFinite(traj.upcr[i]) && traj.upcr[i] > 0);
    assert.ok(traj.albumin[i] >= traj.albumin[0] - 1e-9 && traj.albumin[i] <= 4.2 + 1e-9);
  }
  // labsFor follows the scenario
  assert.ok(m.labsFor('mn', { month: 12, txMonth: 1 }).upcr < m.labsFor('mn', { month: 12, noTx: true }).upcr);
});

test('rule engine recovers every entity from its typical findings', () => {
  for (const id of all) {
    const r = m.classify(m.findingsFrom(id, m.typicalLabs(id)));
    assert.equal(r.entity, id, `${id}: ${r.steps.join(' > ')}`);
    assert.ok(r.steps.length >= 1);
  }
});

test('rule engine recovers the entity of 800 generated quiz cases', () => {
  for (let seed = 1; seed <= 800; seed++) {
    const c = m.generateCase(seed);
    const r = m.classify(m.findingsFrom(c.entity, c.labs, { signs: c.signs, biopsy: c.biopsy }));
    assert.equal(r.entity, c.entity, `seed ${seed}: ${c.entity} -> ${r.entity}`);
  }
});

test('quiz cases are reproducible and cover every entity', () => {
  assert.deepEqual(m.generateCase(42), m.generateCase(42));
  const seen = new Set();
  for (let s = 1; s <= 300; s++) seen.add(m.generateCase(s).entity);
  assert.equal(seen.size, all.length);
  // no biopsy in the steroid-sensitive child or typical diabetic nephropathy
  assert.equal(m.biopsyOf('mcd'), null);
  assert.equal(m.biopsyOf('diabetic'), null);
  assert.equal(m.biopsyOf('amyloid').site, 'fat');
});

test('compare flags what separates entities', () => {
  const c = m.compare('mcd', 'fsgsPrimary');
  const f = Object.fromEntries(c.features.map((r) => [r.key, r]));
  assert.ok(f.lm.differs && f.selectivity.differs && f.steroids.differs);
  assert.ok(!f.group.differs);
  const c2 = m.compare('c3gn', 'ddd');
  const f2 = Object.fromEntries(c2.features.map((r) => [r.key, r]));
  assert.ok(f2.em.differs && !f2.ifPattern.differs);
  const same = m.compare('mn', 'mn');
  assert.ok(same.features.every((r) => !r.differs) && same.labs.every((r) => !r.differs));
});

test('every preset points to a valid scenario', () => {
  for (const [key, p] of Object.entries(m.PRESETS)) {
    assert.ok(['explore', 'compare', 'quiz'].includes(p.mode), key);
    if (p.mode === 'explore') {
      assert.ok(m.ENTITIES[p.entity], key);
      if (p.week != null) assert.ok(['steroids', 'raas'].includes(m.ENTITIES[p.entity].course), key);
      if (p.month != null) assert.equal(m.ENTITIES[p.entity].course, 'mn', key);
      if (p.view) assert.ok(['glom', 'barrier', '3d'].includes(p.view), key);
    }
    if (p.mode === 'compare') assert.ok(m.ENTITIES[p.a] && m.ENTITIES[p.b], key);
  }
});

test('preset scenarios behave as documented', () => {
  assert.equal(m.remission(m.labsFor('mcd', { week: 3 }).upcr, 9, 'child'), 'complete');
  assert.equal(m.remission(m.labsFor('fsgsGenetic', { week: 6 }).upcr, 5.5, 'child', m.labsFor('fsgsGenetic', { week: 6 }).albumin), 'none');
  const rtx = m.labsFor('mn', { month: 12, txMonth: 1 });
  assert.equal(m.status('pla2r', rtx.pla2r), 'normal');
  assert.ok(rtx.upcr < 3.5);
  const untreated = m.labsFor('mn', { month: 12, noTx: true });
  assert.equal(m.status('pla2r', untreated.pla2r), 'high');
  assert.ok(untreated.upcr > 3.5);
  const lowT = m.labsFor('mn', { month: 12, noTx: true, pla2r0: 20 });
  assert.equal(m.status('pla2r', lowT.pla2r), 'normal');
});

test('model is pure: no DOM access and repeat calls agree', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  assert.deepEqual(m.typicalLabs('mn'), m.typicalLabs('mn'));
  assert.deepEqual(m.mnModel({ txMonth: 2 }), m.mnModel({ txMonth: 2 }));
  const before = JSON.stringify(m.ENTITIES);
  m.generateCase(7); m.compare('mn', 'mcd'); m.labsFor('mcd', { week: 2 });
  assert.equal(JSON.stringify(m.ENTITIES), before);
});
