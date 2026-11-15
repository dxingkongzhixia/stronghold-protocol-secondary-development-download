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
