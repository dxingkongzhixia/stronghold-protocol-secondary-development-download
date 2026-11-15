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
    assert.ok(sawNumber || charId === 'char_4232_hbound', `${charId}: a blackboard number is on a spec`);

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

test('batch 1–9 numbers: the stat/damage specs carry the blackboard values', (t) => {
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
  // 蓝毒: S0 1.4× on two targets; S2 ATK +20 % and one extra target per attack
  assert.deepEqual(spec('char_129_bluep', 0).spec.attack, { atkScale: 1.4, maxTargets: 2 });
  assert.equal(spec('char_129_bluep', 1).spec.mods.atkPct, 0.2);
  assert.equal(spec('char_129_bluep', 1).spec.attack.maxTargets, 2);
  // 星极: S1 ATK +30 / DEF +45; S2 the same, block +1, and the all-blocked attack hook
  assert.equal(spec('char_274_astesi', 0).spec.mods.atkPct, 0.3);
  assert.equal(spec('char_274_astesi', 0).spec.mods.defPct, 0.45);
  assert.equal(spec('char_274_astesi', 1).spec.mods.blockCnt, 1);
  assert.equal(typeof KITS.char_274_astesi({}, { skills: [] }, { charId: 'char_274_astesi', skill: { id: 'skchr_astesi_2' } }).install, 'function');
  // 海沫: S1 1.2× two hits; S2 ATK +40 %, 45 % physical dodge, death-heal hook
  assert.deepEqual(spec('char_4066_highmo', 0).spec.attack, { atkScale: 1.2, hits: 2 });
  assert.equal(spec('char_4066_highmo', 1).spec.mods.atkPct, 0.4);
  assert.equal(spec('char_4066_highmo', 1).spec.mods.dodgePhys, 0.45);
  assert.equal(typeof KITS.char_4066_highmo({}, { skills: [{ skillId: 'skchr_highmo_2', bb: {} }] }, { charId: 'char_4066_highmo', skill: { id: 'skchr_highmo_2' } }).install, 'function');
  // 吉星: S1 a longer attack interval; S2 ATK +45 % and the cycling status handler
  assert.ok(spec('char_4203_kichi', 0).spec.mods.batPct > 0);
  assert.equal(spec('char_4203_kichi', 1).spec.mods.atkPct, 0.45);
  assert.equal(typeof spec('char_4203_kichi', 1).spec.onAttack, 'function');
  // 复奏: S1 1.5× splash; S2 1.3× on three targets with a burn
  assert.equal(spec('char_4031_liesel', 0).spec.attack.atkScale, 1.5);
  assert.equal(spec('char_4031_liesel', 0).spec.attack.splashRadius, 1.5);
  assert.equal(spec('char_4031_liesel', 1).spec.attack.atkScale, 1.3);
  assert.equal(spec('char_4031_liesel', 1).spec.attack.maxTargets, 3);
  assert.equal(typeof spec('char_4031_liesel', 1).spec.onAttack, 'function');
  // 奥尔加: S1 1.25× two hits; S2 ATK +40 % with the taunt/sluggish handler
  assert.deepEqual(spec('char_4245_alga', 0).spec.attack, { atkScale: 1.25, hits: 2 });
  assert.equal(spec('char_4245_alga', 1).spec.mods.atkPct, 0.4);
  assert.equal(typeof spec('char_4245_alga', 1).spec.onAttack, 'function');
  // 阿米娅: S1 attack speed +45; S2 seven 39 % shots and the self-stun; S3 ATK +130 %, +50 % max HP, true damage
  assert.equal(spec('char_002_amiya', 0).spec.mods.aspd, 45);
  assert.equal(spec('char_002_amiya', 1).spec.attack.atkScale, 0.39);
  assert.equal(spec('char_002_amiya', 1).spec.attack.hits, 7);
  assert.equal(typeof spec('char_002_amiya', 1).spec.onEnd, 'function');
  assert.equal(spec('char_002_amiya', 2).spec.mods.atkPct, 1.3);
  assert.equal(spec('char_002_amiya', 2).spec.mods.hpPct, 0.5);
  assert.equal(spec('char_002_amiya', 2).spec.attack.dmgType, 'true');
  // 青枳: S1 a DP grant; S2 ATK +10 / DEF +40 and its own start handler
  assert.equal(typeof spec('char_488_buildr', 0).spec.onStart, 'function');
  assert.equal(spec('char_488_buildr', 1).spec.mods.atkPct, 0.1);
  assert.equal(spec('char_488_buildr', 1).spec.mods.defPct, 0.4);
  assert.equal(typeof spec('char_488_buildr', 1).spec.onStart, 'function');
  // 芬: S1 1.35× two hits; S2 a passive ATK +85 / DEF +25 / block +1
  assert.deepEqual(spec('char_1036_fang2', 0).spec.attack, { atkScale: 1.35, hits: 2 });
  assert.equal(spec('char_1036_fang2', 1).spec.kind, 'passive');
  assert.equal(spec('char_1036_fang2', 1).spec.mods.atkPct, 0.85);
  assert.equal(spec('char_1036_fang2', 1).spec.mods.blockCnt, 1);
  // 奥斯汀: S1 ATK +27 / AS +25; S2 ATK +35 %, a longer interval and the bind handler
  assert.equal(spec('char_346_aosta', 0).spec.mods.atkPct, 0.27);
  assert.equal(spec('char_346_aosta', 0).spec.mods.aspd, 25);
  assert.equal(spec('char_346_aosta', 1).spec.mods.atkPct, 0.35);
  assert.ok(spec('char_346_aosta', 1).spec.mods.batPct > 0);
  assert.equal(typeof spec('char_346_aosta', 1).spec.onAttack, 'function');
  // 䌷: S1 at 2.1×; S2 ATK +62 %, two targets and the under-half-HP extra hit
  assert.equal(spec('char_4221_ju', 0).spec.attack.atkScale, 2.1);
  assert.equal(spec('char_4221_ju', 1).spec.mods.atkPct, 0.62);
  assert.equal(spec('char_4221_ju', 1).spec.attack.maxTargets, 2);
  assert.equal(typeof spec('char_4221_ju', 1).spec.onAttack, 'function');
  // 车尔尼: S1 ATK +35 % and RES ×1.65; S2 +50 % max HP, taunt and the end-of-skill blast
  assert.equal(spec('char_4047_pianst', 0).spec.mods.atkPct, 0.35);
  assert.equal(spec('char_4047_pianst', 0).spec.mods.resMul, 1.65);
  assert.equal(spec('char_4047_pianst', 1).spec.mods.hpPct, 0.5);
  assert.equal(spec('char_4047_pianst', 1).spec.mods.taunt, 1);
  assert.equal(typeof spec('char_4047_pianst', 1).spec.onEnd, 'function');
  // 暴躁铁皮: ATK +160 %, +60 % max HP, a shorter attack interval
  assert.equal(spec('char_618_acrbot', 0).spec.mods.atkPct, 1.6);
  assert.equal(spec('char_618_acrbot', 0).spec.mods.hpPct, 0.6);
  assert.ok(spec('char_618_acrbot', 0).spec.mods.batPct < 0);
  // 云迹: S1 takes off with ATK +45 % / 50 % dodge; S2 three targets
  assert.equal(spec('char_4165_ctrail', 0).spec.mods.atkPct, 0.45);
  assert.equal(spec('char_4165_ctrail', 0).spec.mods.dodgePhys, 0.5);
  assert.equal(spec('char_4165_ctrail', 0).spec.flags.liftoff, true);
  assert.equal(spec('char_4165_ctrail', 1).spec.targeting.maxTargets, 3);
  // 乌啾: S1 attack speed +40; S2 an instant heal with the lose-HP start
  assert.equal(spec('char_4224_turdus', 0).spec.mods.aspd, 40);
  assert.equal(spec('char_4224_turdus', 1).spec.kind, 'instant');
  assert.equal(spec('char_4224_turdus', 1).spec.heal, true);
  assert.equal(typeof spec('char_4224_turdus', 1).spec.onStart, 'function');
  // 风絮: S1 a much shorter interval and 45 % heal; S2 ATK +80 % and two heal targets
  assert.ok(spec('char_4222_taraxa', 0).spec.mods.batPct < 0);
  assert.equal(spec('char_4222_taraxa', 0).spec.attack.healScale, 0.45);
  assert.equal(spec('char_4222_taraxa', 0).spec.flags.liftoff, true);
  assert.equal(spec('char_4222_taraxa', 1).spec.mods.atkPct, 0.8);
  assert.equal(spec('char_4222_taraxa', 1).spec.attack.maxTargets, 2);
  // 水灯心: S1 1.1× two hits; S2 ATK +20 % with the sluggish handler
  assert.deepEqual(spec('char_4177_brigid', 0).spec.attack, { atkScale: 1.1, hits: 2 });
  assert.equal(spec('char_4177_brigid', 1).spec.mods.atkPct, 0.2);
  assert.equal(typeof spec('char_4177_brigid', 1).spec.onAttack, 'function');
  // 罗比菈塔: S1 ATK / DEF +22 %; S2 block +1, DEF +35 %, no attack, and a device on end
  assert.equal(spec('char_484_robrta', 0).spec.mods.atkPct, 0.22);
  assert.equal(spec('char_484_robrta', 0).spec.mods.defPct, 0.22);
  assert.equal(spec('char_484_robrta', 1).spec.mods.blockCnt, 1);
  assert.equal(spec('char_484_robrta', 1).spec.mods.defPct, 0.35);
  assert.equal(spec('char_484_robrta', 1).spec.attack.noAttack, true);
  assert.equal(typeof spec('char_484_robrta', 1).spec.onEnd, 'function');
  // 褐果: S1 an instant heal; S2 attack speed +90 and 120 % heal
  assert.equal(spec('char_4041_chnut', 0).spec.kind, 'instant');
  assert.equal(typeof spec('char_4041_chnut', 0).spec.onStart, 'function');
  assert.equal(spec('char_4041_chnut', 1).spec.mods.aspd, 90);
  assert.equal(spec('char_4041_chnut', 1).spec.attack.healScale, 1.2);
  // 折光: S1 ATK +60 %; S2 AS +55 and two targets
  assert.equal(spec('char_499_kaitou', 0).spec.mods.atkPct, 0.6);
  assert.equal(spec('char_499_kaitou', 1).spec.mods.aspd, 55);
  assert.equal(spec('char_499_kaitou', 1).spec.attack.maxTargets, 2);
  // Miss.Christine: S1 ATK +15 %, two targets; S2 stops attacking and spawns the spirit
  assert.equal(spec('char_4198_christ', 0).spec.mods.atkPct, 0.15);
  assert.equal(spec('char_4198_christ', 0).spec.attack.maxTargets, 2);
  assert.equal(spec('char_4198_christ', 1).spec.attack.noAttack, true);
  assert.equal(typeof spec('char_4198_christ', 1).spec.onStart, 'function');
  // 渡桥: S1 the DP/blast start; S2 ATK +45 % and the DP pulses
  assert.equal(typeof spec('char_4147_mitm', 0).spec.onStart, 'function');
  assert.equal(spec('char_4147_mitm', 1).spec.mods.atkPct, 0.45);
  assert.equal(typeof spec('char_4147_mitm', 1).spec.onStart, 'function');
  // 旅骨: both skills place the alchemy cloud from onStart
  assert.equal(typeof spec('char_4232_hbound', 0).spec.onStart, 'function');
  assert.equal(typeof spec('char_4232_hbound', 1).spec.onStart, 'function');
  // 乌有: S1 stops attacking / blocking and regenerates; S2 is a toggle at ATK +30 %
  assert.equal(spec('char_455_nothin', 0).spec.mods.blockCnt, -99);
  assert.equal(spec('char_455_nothin', 0).spec.mods.hpRegenRatio, 0.09);
  assert.equal(spec('char_455_nothin', 0).spec.attack.noAttack, true);
  assert.equal(spec('char_455_nothin', 1).spec.kind, 'toggle');
  assert.equal(spec('char_455_nothin', 1).spec.mods.atkPct, 0.3);
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
