// test/content/kits_ver_act3.test.js — the version charId kits this tree carries (kits/ops/ver-*.js): on the act3
// autochess data each operator's every skill is authored by its kit (never the generic approximation), the kit keeps the
// blackboard numbers, and the shop form casts. The default data is covered by test/content/kits_*.test.js and keeps its
// by-id lookups (test/versions-keying.test.js).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../../server/data.js';
import { DataSource } from '../../server/sim/simdata.js';
import { setGameData } from '../../server/sim/content/support/index.js';
import { KITS, officialKitKey, skillSpecSource } from '../../server/sim/content/index.js';
import { VERSION_KITS } from '../../server/sim/content/kits/index.js';
import { makeBattle } from '../helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = loadData(path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1'), { log: quiet });
after(() => setGameData(null));

/** The normal (`_a`, its own record) or elite chess record of `charId`, or null. */
function chessId(data, charId, elite) {
  const normal = Object.keys(data.chess).find((id) => {
    const rec = data.chess[id];
    return rec?.charId === charId && id.endsWith('_a') && (!rec.baseId || rec.baseId === id);
  });
  if (!normal) return null;
  if (!elite) return normal;
  const golden = data.chess[normal].goldenId;
  return data.chess[golden]?.charId === charId ? golden : null;
}

function numbersIn(obj, out = [], depth = 0) {
  if (obj == null || depth > 8) return out;
  if (typeof obj === 'number' && Number.isFinite(obj)) { out.push(obj); return out; }
  if (typeof obj !== 'object') return out;
  for (const v of Object.values(obj)) if (typeof v !== 'function') numbersIn(v, out, depth + 1);
  return out;
}

test('the version charId kits author every skill of their act3 operator, and its shop skill casts', (t) => {
  setGameData(ACT3);
  t.after(() => setGameData(null));
  const ds = new DataSource(ACT3, quiet);
  for (const charId of Object.keys(VERSION_KITS)) {
    const normal = chessId(ACT3, charId, false);
    assert.ok(normal, `${charId}: a normal chess in act3`);
    let sawNumber = false;
    for (const elite of [false, true]) {
      const id = chessId(ACT3, charId, elite);
      if (!id) continue;
      const raw = ACT3.chess[id];
      for (let i = 0; i < raw.skills.length; i++) {
        const def = ds.getChess(id, { skillIndex: i });
        assert.equal(def.charId, charId);
        assert.equal(officialKitKey(def), charId, `${id} skill ${i}: the charId kit`);
        assert.equal(skillSpecSource(def), 'skills', `${id} skill ${i}: authored`);
        const built = KITS[charId](def.skill.bb, def.raw, def);
        const spec = built.skills[def.skill.id];
        assert.ok(spec, `${id} skill ${i}: spec`);
        assert.equal(typeof spec.kind, 'string');
        if (spec.kind === 'duration' && def.skill.duration > 0) assert.equal(spec.duration, def.skill.duration);
        const got = numbersIn(spec);
        if (Object.values(def.skill.bb || {}).some((n) => typeof n === 'number' && n !== 0 && n !== 1 && got.some((g) => Math.abs(g - n) < 1e-9))) sawNumber = true;
      }
    }
    assert.ok(sawNumber, `${charId}: a blackboard number is on a spec`);

    const h = makeBattle({
      data: ds, seed: 3, timeLimit: 20, autoFinish: false,
      units: [{ uid: 1, chessId: normal, row: 10, col: 4, carryState: { sp: 999 } }],
      enemies: [{ key: 'enemy_1000_gopro_2', time: 0, pos: [10, 5] }],
    });
    const u = h.unit(1);
    assert.ok(u, `${charId} deployed`);
    assert.ok(h.runUntil(() => u.skill.activations >= 1 || u.skill.active, 12), `${charId} shop skill did not start`);
  }
});

test('a version kit is not offered as a default-version DIY pick (KITTED_CHARS unchanged)', async () => {
  const { KITTED_CHARS } = await import('../../server/sim/content/kits/index.js');
  for (const charId of Object.keys(VERSION_KITS)) assert.equal(KITTED_CHARS.includes(charId), false, charId);
});

test('batch 1–4 numbers: the stat/damage specs carry the blackboard values', (t) => {
  setGameData(ACT3);
  t.after(() => setGameData(null));
  const ds = new DataSource(ACT3, quiet);
  const spec = (charId, skillIndex) => {
    const id = chessId(ACT3, charId, false);
    const def = ds.getChess(id, { skillIndex });
    const built = KITS[charId](def.skill.bb, def.raw, def);
    return { def, spec: built.skills[def.skill.id] };
  };
  // 慕斯: S2 ATK / DEF +36 %
  assert.deepEqual(spec('char_185_frncat', 1).spec.mods, { atkPct: 0.36, defPct: 0.36 });
  // 灰喉: S1 two shots at 1.1×, S2 ATK +15 % and three shots
  assert.deepEqual(spec('char_367_swllow', 0).spec.attack, { atkScale: 1.1, hits: 2 });
  assert.equal(spec('char_367_swllow', 1).spec.mods.atkPct, 0.15);
  assert.equal(spec('char_367_swllow', 1).spec.attack.hits, 3);
  // 拜松: S1 DEF +45 %; S2 self DEF +65 %, taunt, and the ally aura is installed for that skill
  assert.equal(spec('char_325_bison', 0).spec.mods.defPct, 0.45);
  assert.equal(spec('char_325_bison', 1).spec.mods.defPct, 0.65);
  assert.equal(spec('char_325_bison', 1).spec.mods.taunt, 1);
  // 卡达: S1 ATK +35 %; S2 ATK +49 % and an attack stun handler
  assert.equal(spec('char_328_cammou', 0).spec.mods.atkPct, 0.35);
  assert.equal(spec('char_328_cammou', 1).spec.mods.atkPct, 0.49);
  assert.equal(typeof spec('char_328_cammou', 1).spec.onAttack, 'function');
  // 摆渡人: S1 three hits at 1.1×; S2 attacks at 1.55× and heals
  assert.deepEqual(spec('char_4166_varkis', 0).spec.attack, { atkScale: 1.1, hits: 3 });
  assert.equal(spec('char_4166_varkis', 1).spec.kind, 'duration');
  assert.equal(spec('char_4166_varkis', 1).spec.attack.atkScale, 1.55);
  assert.equal(typeof spec('char_4166_varkis', 1).spec.onAttack, 'function');
  // 夏栎: S1 is a toggle at +20 % ATK; S2 attack speed +36
  assert.equal(spec('char_492_quercu', 0).spec.kind, 'toggle');
  assert.equal(spec('char_492_quercu', 0).spec.mods.atkPct, 0.2);
  assert.equal(spec('char_492_quercu', 1).spec.mods.aspd, 36);
  // 霜叶: S1 at 1.2×; S2 attack speed +20
  assert.equal(spec('char_193_frostl', 0).spec.attack.atkScale, 1.2);
  assert.equal(spec('char_193_frostl', 1).spec.mods.aspd, 20);
  assert.equal(typeof spec('char_193_frostl', 1).spec.onAttack, 'function');
  // 烈夏: S1 ATK +27 % and AS +25; S2 ATK +50 % and two targets
  assert.equal(spec('char_194_leto', 0).spec.mods.atkPct, 0.27);
  assert.equal(spec('char_194_leto', 0).spec.mods.aspd, 25);
  assert.equal(spec('char_194_leto', 1).spec.mods.atkPct, 0.5);
  assert.equal(spec('char_194_leto', 1).spec.attack.maxTargets, 2);
  // 真理: S1 a shorter attack interval; S2 ATK +25 % and three targets
  assert.ok(spec('char_195_glassb', 0).spec.mods.batPct < 0);
  assert.equal(spec('char_195_glassb', 1).spec.mods.atkPct, 0.25);
  assert.equal(spec('char_195_glassb', 1).spec.attack.maxTargets, 3);
  // 铸铁: S1 a self heal; S2 ATK +60 % and 6 % max HP regen per second
  assert.equal(typeof spec('char_333_sidero', 0).spec.onStart, 'function');
  assert.equal(spec('char_333_sidero', 1).spec.mods.atkPct, 0.6);
  assert.equal(spec('char_333_sidero', 1).spec.mods.hpRegenRatio, 0.06);
  // 陨星: S1 at 1.5×; S2 at 2.1× with a DEF-shred handler
  assert.equal(spec('char_219_meteo', 0).spec.attack.atkScale, 1.5);
  assert.equal(spec('char_219_meteo', 1).spec.attack.atkScale, 2.1);
  assert.equal(typeof spec('char_219_meteo', 1).spec.onAttack, 'function');
  // 杰克: S1 at 1.8×; S2 stops attacking and its evade/counter lives in install
  assert.equal(spec('char_347_jaksel', 0).spec.attack.atkScale, 1.8);
  assert.equal(spec('char_347_jaksel', 1).spec.attack.noAttack, true);
  {
    const id = chessId(ACT3, 'char_347_jaksel', false);
    const def = ds.getChess(id, { skillIndex: 1 });
    assert.equal(typeof KITS.char_347_jaksel(def.skill.bb, def.raw, def).install, 'function');
  }
});

test('慕斯\'s next attack weakens the target it hits (ATK −20 % for 5 s)', (t) => {
  setGameData(ACT3);
  t.after(() => setGameData(null));
  const ds = new DataSource(ACT3, quiet);
  const h = makeBattle({
    data: ds, seed: 5, timeLimit: 20, autoFinish: false,
    units: [{ uid: 1, chessId: chessId(ACT3, 'char_185_frncat', false), row: 10, col: 4, carryState: { sp: 999 } }],
    enemies: [{ key: 'enemy_1000_gopro_2', time: 0, pos: [10, 5] }],
  });
  const u = h.unit(1);
  assert.ok(h.runUntil(() => u.skill.active || u.skill.activations >= 1, 12));
  const e = h.enemies()[0];
  assert.ok(h.runUntil(() => (e.buffs || []).some((b) => String(b.key).startsWith('frncat:weaken')), 8));
  const buff = e.buffs.find((b) => String(b.key).startsWith('frncat:weaken'));
  assert.equal(buff.mods.atkPct, -0.2);
  assert.ok(buff.duration >= 4.9 && buff.duration <= 5.1);
});
