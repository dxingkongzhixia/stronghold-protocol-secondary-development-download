// test/render/feedback2-doll.test.js — GitHub issue #44 「归鲨死了没替身」 (DESIGN §22.11), client side: a 傀儡师 fighting as
// its <替身> is in the model form 'doll' (sim professions.js: fx 'substitute' { form: 'doll', dur } … 'swap' / 'dollEnd'
// { form: null }, UnitInfo `form`), drawn with the skeleton's *_B clips (render/units.js FORMS): 归溟幽灵鲨's Start_B fades
// the 替身 in, Idle_B, Die_B breaks it apart over its last second, the 本体 comes back on Start_2 (the form's `leave`
// clip); knocked out as the 替身 she collapses on Die_B_2 and stays so — facing UP too, on the Front model a knocked-out
// operator lies with (§22.1), and on any model built while she lies down. 0.1.1 drew the 本体 all along. Headless fake
// PIXI (test/render/fakepixi.js) on the real manifest and asset helpers; the clip meanings are checked on the real skeleton
// when the assets are fetched.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { statusIconKey } from '../../public/js/render/style.js';
import { STATUS_KEYS } from '../../public/js/render/textures.js';
import { spineEntry, hasBackSpine } from '../../public/js/assets.js';
import { fxForm } from '../../shared/protocol.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { getData } from '../../server/data.js';
import { unitInfo } from '../../server/sim/snapshot.js';
import { DOLL_SWITCH } from '../../server/sim/professions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const GHOST = 'char_1023_ghost2', KAZEMA = 'char_4016_kazema';

let fake, UnitView, FORMS, renderInfo;
before(async () => {
  fake = installFakePixi();
  ({ UnitView, FORMS } = await import('../../public/js/render/units.js'));
  ({ renderInfo } = await import('../../public/js/render/app.js'));
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
/** Asset store on the real manifest (Front / Back entries, their animation names) and asset helpers; loads counted. */
function store() {
  const s = {
    loads: 0,
    picture: () => null,
    image: async () => null,
    hasBack: (id) => hasBackSpine(assets, id),
    spineEntry: (id, o) => spineEntry(assets, id, o),
    spine: { acquire: async (entry) => { s.loads++; return { animations: Object.keys(entry.animations || {}).map((name) => ({ name })) }; }, release() {} },
  };
  return s;
}
async function op(id, info = {}) {
  const ctx = fakeViewCtx(fake.P, { assets: store(), cam });
  const v = new UnitView(ctx, { id: 1, side: 'ally', kind: 'op', defId: id, spine: id, tier: 5, x: 5, y: 9, maxHp: 2657, dir: 'RIGHT', skillIndex: 1, ...info });
  await tick(); await tick();
  assert.ok(v.actor, 'Spine model built');
  return v;
}
const clip = (v) => v.actor.current;
const frames = (v, n, dt = 1 / 60) => { for (let i = 0; i < n; i++) v.update(dt, cam(), i * dt); };
const secs = (v, s) => frames(v, Math.round(s * 60));

describe('归溟幽灵鲨\'s 替身 (FORMS doll)', () => {
  test('the clip set exists in her Front skeleton; the Back one (facing UP) only has Idle_B and Start_2', () => {
    const f = FORMS[GHOST].doll;
    const front = assets.chars[GHOST].spine.front.animations, back = assets.chars[GHOST].spine.back.animations;
    for (const name of [f.change, f.end, f.leave, f.roles.idle, f.roles.die]) assert.ok(name in front, name);
    assert.equal(f.roles.attack, null, 'the 替身 never attacks (PRTS 特性备注)');
    assert.equal(f.roles.skill, null);
    for (const name of ['Idle_B', 'Start_2']) assert.ok(name in back, `Back ${name}`);
    for (const name of ['Start_B', 'Die_B', 'Die_B_2']) assert.ok(!(name in back), `no Back ${name}`);
    assert.equal(assets.chars[GHOST].spine.front.anims.idle, 'Idle', 'the manifest keeps the 本体');
  });

  test('the switch: Start_B, Idle_B (no attack clip), Die_B over its last second, the 本体 back on Start_2 with her own skill clip', async () => {
    const v = await op(GHOST, { skillIndex: 2 });
    assert.equal(clip(v), 'Idle');
    const dur = DOLL_SWITCH + 20;
    v.setForm('doll', { id: 1, form: 'doll', dur });
    assert.equal(clip(v), 'Start_B', 'the 替身 fades in');
    secs(v, 1.1);
    assert.equal(clip(v), 'Idle_B');
    v.onAttack(null, 2);
    assert.equal(clip(v), 'Idle_B', 'no attack clip');
    secs(v, dur - 1 - 1.1 + 0.05);
    assert.equal(clip(v), 'Die_B', 'it breaks apart over its last second');
    secs(v, 0.9);
    v.setForm(null, { id: 1, form: null });          // the sim's 'swap' fx
    assert.equal(clip(v), 'Start_2', 'the 本体 comes back');
    secs(v, 1.1);
    assert.equal(clip(v), 'Idle');
    v.setSkill(true);
    assert.equal(clip(v), 'Skill_3_Begin', 'her equipped skill\'s clips again (S3), not the manifest default');
    v.die();
    assert.equal(clip(v), 'Die', 'the 本体\'s death clip');
  });

  test('knocked out as the 替身: Die_B_2, held through the form reset (\'dollEnd\'); the redeploy is the 本体', async () => {
    const v = await op(GHOST);
    v.setForm('doll', { dur: 21 });
    secs(v, 2);
    v.die();
    assert.equal(clip(v), 'Die_B_2', 'the 替身 collapses');
    v.setForm(null, { form: null });                 // fx 'dollEnd', after the 'die' event
    assert.equal(clip(v), 'Die_B_2', 'no Start_2 on a knocked-out view');
    assert.equal(v.form, null);
    secs(v, 3);
    v.onDeploy();
    assert.equal(clip(v), 'Start', 'redeployed as the 本体');
    secs(v, 1.2);
    assert.equal(clip(v), 'Idle');
  });

  test('a view built while she is the 替身 (UnitInfo form) starts on Idle_B; facing UP the Back model shows the 替身 without the switch clips it lacks', async () => {
    const v = await op(GHOST, { form: 'doll' });
    assert.equal(clip(v), 'Idle_B');
    const up = await op(GHOST, { dir: 'UP' });
    assert.ok(up.entryBack, 'the Back model');
    up.setForm('doll', { dur: 21 });
    assert.equal(clip(up), 'Idle_B', 'no Start_B in the Back skeleton: straight to the 替身');
    secs(up, 21);
    up.setForm(null, { form: null });
    assert.equal(clip(up), 'Start_2', 'its Start_2');
    const turned = await op(GHOST, { form: 'doll' });
    turned.setDir('UP');
    await tick(); await tick();
    assert.ok(turned.entryBack && clip(turned) === 'Idle_B', 'turned UP mid-form: the Back model keeps the 替身');
  });

  test('the 替身\'s status icon; a late switch fx skips a change clip that would already have ended', async () => {
    assert.equal(statusIconKey('trait:substitute'), 'doll');
    assert.ok(STATUS_KEYS.includes('doll'));
    const v = await op(GHOST);
    v.setForm('doll', { dur: 21, late: 1.5 });
    assert.equal(clip(v), 'Idle_B');
    v.setForm(null, { form: null, late: 2 });
    assert.equal(clip(v), 'Idle', 'no Start_2 when it would be over');
  });
});

// Knocked out as the 替身 with the sim's order in one frame: 'die', then fx 'dollEnd' { form: null } (the form back to the
// 本体 for the redeploy), then the frame's update. Facing UP the view lies down on the Front model (§22.1: the Back
// skeleton has no fall), loaded after the reset: it still lies as the 替身 (the form it died in, `_dieForm`), and so does
// any model built while she is down; the redeploy is the 本体 on the Back model.
describe('knocked out as the 替身: facing UP, models built while down, the redeploy (§22.1 × §22.11)', () => {
  const DOWN = [1, 70, 70, 0, 9, 5];
  const settle = async () => { await tick(); await tick(); };
  async function doll(id, dir) {
    const ctx = fakeViewCtx(fake.P, { assets: store(), cam });
    const v = new UnitView(ctx, { id: 1, side: 'ally', kind: 'op', defId: id, spine: id, tier: 5, x: 5, y: 9, maxHp: 2657, dir, skillIndex: 1 });
    await settle();
    v.setForm('doll', { id: 1, form: 'doll', dur: 21 });
    secs(v, 2);
    assert.equal(clip(v), 'Idle_B');
    return v;
  }
  const knockOut = (v) => { v.die(); v.setForm(null, { id: 1, form: null }); v.setDown(DOWN, 0); };

  test('归溟幽灵鲨 facing UP: the Front model shows the 替身 collapsing (Die_B_2), with the reset in the same frame or the next', async () => {
    for (const late of [false, true]) {
      const v = await doll(GHOST, 'UP');
      assert.ok(v.entryBack, 'standing: the Back model');
      v.die();
      if (!late) v.setForm(null, { id: 1, form: null });
      v.setDown(DOWN, 0);
      frames(v, 1);
      if (late) v.setForm(null, { id: 1, form: null });
      await settle(); secs(v, 0.5);
      assert.ok(!v.entryBack, 'down: the Front model (its Back skeleton has no fall)');
      assert.equal(clip(v), 'Die_B_2', `the 替身 collapses (reset ${late ? 'a frame later' : 'in the same frame'})`);
      assert.equal(v.form, null, 'the form is the 本体\'s again');
    }
  });

  test('a model built while she lies down keeps the 替身\'s pose (facing RIGHT: dropped and loaded again)', async () => {
    const v = await doll(GHOST, 'RIGHT');
    knockOut(v);
    frames(v, 1); await settle(); secs(v, 0.5);
    assert.equal(clip(v), 'Die_B_2');
    v._dropActor(); v.retryAssets(); await settle(); frames(v, 5);
    assert.equal(clip(v), 'Die_B_2', 'rebuilt: still the 替身');
  });

  test('the redeploy is the 本体: facing UP back on the Back model, its deploy clip, then its idle', async () => {
    const v = await doll(GHOST, 'UP');
    knockOut(v);
    frames(v, 1); await settle(); secs(v, 2);
    v.setDown(null); v.onDeploy();
    frames(v, 1); await settle(); frames(v, 2);
    assert.ok(v.entryBack, 'the Back model again');
    assert.equal(clip(v), 'Start');
    secs(v, 1.2);
    assert.equal(clip(v), 'Idle', 'the 本体\'s idle, not Idle_B');
  });

  test('revived in the same frame (阿戈尔: die → deploy → dollEnd): the 本体 comes back on Start_2, no model is loaded', async () => {
    for (const dir of ['UP', 'RIGHT']) {
      const v = await doll(GHOST, dir);
      const loads = v.ctx.assets.loads;
      v.die(); v.onDeploy(); v.setForm(null, { id: 1, form: null });
      frames(v, 1); await settle(); frames(v, 2);
      assert.equal(clip(v), 'Start_2', dir);
      assert.equal(v.ctx.assets.loads, loads, `${dir}: no model load`);
    }
  });

  test('风丸 facing UP: her Back skeleton\'s Start_B and Attack_B; knocked out as the 替身, the Front model\'s Die_B', async () => {
    const ctx = fakeViewCtx(fake.P, { assets: store(), cam });
    const v = new UnitView(ctx, { id: 1, side: 'ally', kind: 'op', defId: KAZEMA, spine: KAZEMA, tier: 2, x: 5, y: 9, maxHp: 1816, dir: 'UP', skillIndex: 0 });
    await settle();
    assert.ok(v.entryBack);
    v.setForm('doll', { id: 1, form: 'doll', dur: 21 });
    assert.equal(clip(v), 'Start_B', 'its Back skeleton has the switch clip');
    secs(v, 1.1);
    v.onAttack(null, 2);
    assert.equal(clip(v), 'Attack_B', '…and the 替身\'s attack');
    secs(v, 2);
    knockOut(v);
    frames(v, 1); await settle(); secs(v, 0.5);
    assert.ok(!v.entryBack);
    assert.equal(clip(v), 'Die_B');
  });

  test('[ASSUMED] a view built from UnitInfo while she lies down (no form: the sim reset it) shows the 本体\'s fall', async () => {
    const ctx = fakeViewCtx(fake.P, { assets: store(), cam });
    const v = new UnitView(ctx, { id: 1, side: 'ally', kind: 'op', defId: GHOST, spine: GHOST, tier: 5, x: 5, y: 9, maxHp: 2657, dir: 'UP', skillIndex: 1 });
    await settle();
    v.setDown(DOWN, 0, true);
    frames(v, 1); await settle(); frames(v, 2);
    assert.equal(clip(v), 'Die');
  });
});

test('风丸\'s 替身: Start_B, Idle_B / Attack_B (it attacks), Die_B; the 本体 back on Start', async () => {
  const anims = assets.chars[KAZEMA].spine.front.animations;
  for (const name of ['Start_B', 'Idle_B', 'Attack_B', 'Die_B', 'Start']) assert.ok(name in anims, name);
  const v = await op(KAZEMA);
  v.setForm('doll', { dur: 21 });
  assert.equal(clip(v), 'Start_B');
  secs(v, 1.1);
  assert.equal(clip(v), 'Idle_B');
  v.onAttack(null, 2);
  assert.equal(clip(v), 'Attack_B');
  secs(v, 3);
  v.setForm(null, { form: null });
  assert.equal(clip(v), 'Start');
  const w = await op(KAZEMA, { form: 'doll' });
  w.die();
  assert.equal(clip(w), 'Die_B');
});

test('sim → view: the real 归溟幽灵鲨\'s lethal hit puts UnitInfo `form` doll (renderInfo keeps it) and its fx carry the forms the view switches on', async () => {
  const h = makeBattle({ autoFinish: false, timeLimit: 60, defs: { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e9, atk: 0, speed: 0 }) } },
    units: [{ chessId: 'chess_char_5_13_a', row: 9, col: 5 }], enemies: [{ key: 'enemy_dummy', pos: [9, 6] }] });
  h.step();
  const g = h.unit('chess_char_5_13_a');
  const v = await op(GHOST, renderInfo(unitInfo(g)));
  const apply = () => { for (const e of h.eventsOf('fx')) if (e[4]?.id === g.id && fxForm(e) !== undefined) v.setForm(fxForm(e), e[4]); h.events.length = 0; };
  h.b.dealDamage(null, g, { amount: 1e9, type: 'true' });
  apply();
  assert.equal(renderInfo(unitInfo(g)).form, 'doll');
  assert.equal(clip(v), 'Start_B');
  secs(v, 1.1);
  h.run(DOLL_SWITCH + 20.05);
  apply();
  assert.equal(clip(v), 'Start_2', 'back to the 本体');
  assert.equal(renderInfo(unitInfo(g)).form, undefined);
});

// The clip meanings, read from the official skeleton (tools/assets/skel.mjs's parser, @pixi-spine/runtime-3.8): the *_B
// clips draw only the 替身's own slots (names ending in _T), Start_B and Start_2 fade in, Die_B ends faded out (the 替身
// gone: the switch back), Die_B_2 keeps it visible (collapsed: a knock-out).
const SKEL = path.join(ROOT, `public/assets/spine/op/${GHOST}/front/${GHOST}.skel`);
test('the official skeleton: *_B clips are the 替身, Die_B ends gone, Die_B_2 ends down, Start_2 brings the 本体 back', { skip: !existsSync(SKEL) && 'assets not fetched' }, () => {
  const require = createRequire(path.join(ROOT, 'package.json'));
  const r = require('@pixi-spine/runtime-3.8'), B = require('@pixi-spine/base');
  const att = (n) => new r.RegionAttachment(n);
  const loader = { newRegionAttachment: (s, n) => att(n), newMeshAttachment: (s, n) => new r.MeshAttachment(n), newBoundingBoxAttachment: (s, n) => new r.BoundingBoxAttachment(n), newPathAttachment: (s, n) => new r.PathAttachment(n), newPointAttachment: (s, n) => new r.PointAttachment(n), newClippingAttachment: (s, n) => new r.ClippingAttachment(n) };
  const data = new r.SkeletonBinary(loader).readSkeletonData(new Uint8Array(readFileSync(SKEL)));
  const sk = new r.Skeleton(data);
  /** Slots drawn (attached, alpha > 0) at time t of clip `name`: { doll, body } counts. */
  const drawn = (name, t) => {
    const a = data.findAnimation(name);
    sk.setToSetupPose();
    a.apply(sk, 0, Math.min(t, a.duration), false, null, 1, B.MixBlend.setup, B.MixDirection.mixIn);
    let doll = 0, body = 0;
    for (const s of sk.slots) if (s.attachment && s.color.a > 0.01) { if (/_T\d*$/.test(s.data.name)) doll++; else body++; }
    return { doll, body };
  };
  for (const name of ['Idle_B', 'Start_B', 'Die_B', 'Die_B_2']) assert.equal(drawn(name, 0.5).body, 0, `${name}: no 本体 slot`);
  for (const name of ['Idle', 'Start_2', 'Die']) assert.equal(drawn(name, 0.5).doll, 0, `${name}: no 替身 slot`);
  assert.ok(drawn('Idle_B', 0.5).doll > 30, 'Idle_B draws the 替身');
  assert.equal(drawn('Start_B', 0).doll, 0, 'Start_B: it fades in');
  assert.equal(drawn('Die_B', 1).doll, 0, 'Die_B: gone at its end');
  assert.ok(drawn('Die_B_2', 1).doll > 30, 'Die_B_2: still there, collapsed');
  assert.equal(drawn('Start_2', 0).body, 0, 'Start_2: the 本体 fades in');
});

// 结城理 (custom): his skeleton carries a <替身> clip set PER SKILL (Doll_Skill_1_* / _2_* / _3_P1_*) plus the
// transformed second one (_3_P2_*). His kit names them (trait.dollForm / dollForm2, kits/tier3.js) and professions.js
// publishes the form per switch (fx 'substitute' { form }), so the view enters exactly the selected skill's doll — and
// S3's 俄耳甫斯 once the first one is knocked out (dollLives). Player report: the doll drew the 本体's clips.
describe('结城理\'s <替身> (FORMS doll / doll2 / doll3 / doll3b)', () => {
  const MAK = 'char_4217_makoto';
  const D = getData({ log: { warn() {}, error() {}, info() {} } });
  const battle = (skillIndex) => {
    const rec = D.chess['chess_char_4217_makoto_a'];
    const h = makeBattle({
      defs: { chess: { [rec.id]: rec } },
      units: [{ chessId: rec.id, row: 10, col: 4, dir: 'RIGHT', skillIndex }],
      enemies: [{ key: 'e_dummy', count: 1, interval: 0, pos: [10, 7] }],
      autoFinish: false, timeLimit: 60,
    });
    h.step(1);
    return h;
  };

  test('each skill has its own clip set in the skeleton; the base roles use no Doll_ clip', () => {
    const front = assets.chars[MAK].spine.front.animations;
    for (const [form, names] of Object.entries({
      doll: ['Doll_Skill_1_SwitchIn', 'Doll_Skill_1_Idle', 'Doll_Skill_1_Attack', 'Doll_Skill_1_Die'],
      doll2: ['Doll_Skill_2_SwitchIn', 'Doll_Skill_2_Loop', 'Doll_Skill_2_Die'],
      doll3: ['Doll_Skill_3_P1_SwitchIn', 'Doll_Skill_3_P1_Idle', 'Doll_Skill_3_P1_Attack_A', 'Doll_Skill_3_P1toP2_ChangeEnd'],
      doll3b: ['Doll_Skill_3_P1toP2_ChangeEnd', 'Doll_Skill_3_P2_Loop', 'Doll_Skill_3_P2_Die'],
    })) {
      const f = FORMS[MAK] && FORMS[MAK][form];
      assert.ok(f, `FORMS.${MAK}.${form} exists`);
      for (const n of [f.change, f.end, f.leave, f.roles.idle, f.roles.die].filter((x) => x != null)) assert.ok(n in front, `${form}: ${n} in the skeleton`);
      for (const n of names) assert.ok(n in front, `${form}: ${n}`);
      // every persona that swings carries its attack clip (S1 极速送达, S2 重力自定义 — its one Loop IS its attack — and
      // S3-P1 塔纳托斯); only the S3 second <替身> (俄耳甫斯) draws none: the kit disarms it (a support persona)
      if (form === 'doll3b') assert.equal(f.roles.attack, null, `${form}: the disarmed support 替身 never attacks`);
      else assert.ok(f.roles.attack && f.roles.attack.loop in front, `${form}: the 替身 attacks`);
      assert.equal(f.leave, 'Start', `${form}: the 本体 comes back`);
    }
    assert.ok(!/Doll_/.test(JSON.stringify(assets.chars[MAK].spine.front.anims)), 'no Doll_ clip in the base roles');
    assert.equal(assets.chars[MAK].spine.front.anims.die, 'SwitchOut', 'the 本体 "falls" by switching out');
  });

  test('the sim publishes the selected skill\'s form; S3\'s second <替身> gets its own', () => {
    for (const [idx, form, form2] of [[0, 'doll', 'doll'], [1, 'doll2', 'doll2'], [2, 'doll3', 'doll3b']]) {
      const h = battle(idx);
      const u = h.unit('chess_char_4217_makoto_a');
      assert.ok(u, `S${idx + 1}: the operator is on the field`);
      h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
      h.run(2);
      assert.ok(u.alive && u.trait.doll, `S${idx + 1}: switched to the <替身>`);
      assert.equal(u.form, form, `S${idx + 1}: the doll form`);
      assert.equal(u.trait.dollNo, 1);
      if (form === form2) continue;
      h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
      h.run(2);
      assert.ok(u.alive && u.trait.dollNo === 2, 'S3: the second <替身> instead of a knock-out');
      assert.equal(u.form, form2, 'S3: the transformed doll form');
    }
  });

  // The regression the report describes: while the skill runs (so the skill flag is on and the persona is out) the
  // persona that attacks must play ITS attack clip. S1 / S3-P1 did; S2's persona attacked in the sim (the kit's
  // max_target / fear / execute hit) but had no attack role, so the actor stayed in its idle — its attack animation was
  // lost. S3's second <替身> (俄耳甫斯) is disarmed by the kit, so it draws none.
  test('the actor plays each swinging persona\'s attack clip while the skill runs; the disarmed second <替身> does not', async () => {
    for (const [form, want, skillIndex] of [['doll', 'Doll_Skill_1_Attack', 0], ['doll2', 'Doll_Skill_2_Loop', 1], ['doll3', 'Doll_Skill_3_P1_Attack_A', 2]]) {
      const v = await op(MAK, { skillIndex });
      v.setForm(form, { dur: 20 });
      v.setSkill(true);
      secs(v, 1.2);                       // the switch clip plays out
      v.onAttack(null, 3);
      assert.equal(clip(v), want, `${form}: the 替身's attack clip, not its idle`);
      assert.equal(v.actor.mode, 'attack', `${form}: the attack mode while the skill runs`);
    }
    const b = await op(MAK, { skillIndex: 2 });
    b.setForm('doll3b', { dur: 20 });
    b.setSkill(true);
    secs(b, 1.2);
    b.onAttack(null, 3);
    assert.equal(clip(b), 'Doll_Skill_3_P2_Loop', 'doll3b: no attack clip of its own (the support persona)');
    assert.notEqual(b.actor.mode, 'attack', 'doll3b: it does not enter attack mode');
  });
});
