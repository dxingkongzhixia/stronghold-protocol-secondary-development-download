// test/versions-band-skill-view.test.js — m.private.bandSkill (server/match/player/views.js bandSkillView): the 规程
// active strategy skill the prep HUD draws. Covers the null case of every band without an ACTIVE skill (the default
// 盟约 set), the per-round / per-match / cooldown counters, the official stage walk, the live price, and the phase
// gate. The collection of the band records is the version data (data/versions/act3autochess-v3_1/bands.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlayerViews } from '../server/match/player/views.js';
import { PHASE } from '../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1', 'bands.json'), 'utf8'));
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bands.json'), 'utf8'));
const versionBands = Array.isArray(V) ? V : Object.values(V);
const defaultBands = Array.isArray(D) ? D : Object.values(D);

/** The fields bandSkillView reads, over a band of the version data. */
function view(bandId, over = {}) {
  const state = {
    bandId,
    gd: { band: (id) => versionBands.find((b) => b.bandId === id) || defaultBands.find((b) => b.bandId === id) || null },
    m: {
      round: 3,
      phase: PHASE.PREP,
      dispatch: (_ps, hook, ev) => {
        if (hook === 'onBandSkillPrice') ev.cost += state.counters ?? 0;
        return ev;
      },
    },
    shop: { level: 4 },
    stats: { gold: 0 },
    bonds: {},
    bandSkill: { uses: 0, total: 0, round: 0, cooldownUntil: 0 },
    counters: 0,
    funds: 10,
    alive: true,
    ready: false,
    ...over,
  };
  return PlayerViews.prototype.bandSkillView.call(state);
}

test('a band without an ACTIVE skill has no bandSkill (every default 盟约 band)', () => {
  for (const b of defaultBands) assert.equal(view(b.bandId), null, b.bandId);
  assert.equal(view('band_smith'), null, 'a passive 规程 band');
  assert.equal(view(null), null);
});

test('ROUND_RESET: the name, cost, cap and remaining uses of a round', () => {
  const v = view('band_price');
  assert.equal(v.name, '内部货源');
  assert.equal(v.targetType, 'NO_TARGET');
  assert.equal(v.cost, 0);
  assert.equal(v.cap, 1);
  assert.equal(v.usesLeft, 1);
  assert.equal(v.available, true);
  const used = view('band_price', { bandSkill: { uses: 1, total: 1, round: 3, cooldownUntil: 0 } });
  assert.equal(used.usesLeft, 0);
  assert.equal(used.available, false, 'used up this round');
  const next = view('band_price', { bandSkill: { uses: 1, total: 1, round: 2, cooldownUntil: 0 } });
  assert.equal(next.usesLeft, 1, 'a stale round counter reads as unused');
  assert.equal(next.available, true);
});

test('ALL_LIMIT: the whole match, not the round', () => {
  const first = view('band_high', { funds: 3 });
  assert.equal(first.cost, 3);
  assert.equal(first.cap, 1);
  assert.equal(first.usesLeft, 1);
  const spent = view('band_high', { funds: 3, bandSkill: { uses: 1, total: 1, round: 3, cooldownUntil: 0 } });
  assert.equal(spent.usesLeft, 0, 'a new round does not restore an ALL_LIMIT use');
  const later = view('band_high', { funds: 3, bandSkill: { uses: 0, total: 1, round: 9, cooldownUntil: 0 } });
  assert.equal(later.usesLeft, 0);
  assert.equal(later.available, false);
});

test('COOLDOWN: the cooldown in rounds, no use count', () => {
  const ready = view('band_fund');
  assert.equal(ready.cooldown, 0);
  assert.equal(ready.usesLeft, null);
  assert.equal(ready.available, true);
  const cooling = view('band_fund', { bandSkill: { uses: 1, total: 1, round: 3, cooldownUntil: 9 } });
  assert.equal(cooling.cooldown, 6);
  assert.equal(cooling.available, false);
  const back = view('band_fund', { m: { round: 9, phase: PHASE.PREP, dispatch: () => {} }, bandSkill: { uses: 1, total: 1, round: 3, cooldownUntil: 9 } });
  assert.equal(back.cooldown, 0);
  assert.equal(back.available, true);
});

test('DEFAULT ("可再次使用"): no per-round count, the growing cost is the limit', () => {
  const first = view('band_kazimier', { funds: 12 });
  assert.equal(first.cost, 6);
  assert.equal(first.usesLeft, null);
  assert.equal(first.available, true);
  const again = view('band_kazimier', { funds: 12, bandSkill: { uses: 1, total: 1, round: 3, cooldownUntil: 0 } });
  assert.equal(again.usesLeft, null);
  assert.equal(again.available, true, 'still usable in the same round');
});

test('the official stage walk: 妮芙 upgrades at rounds 4, 8, 12', () => {
  const at = (round) => view('band_dance', { m: { round, phase: PHASE.PREP, dispatch: () => {} } });
  assert.equal(at(3).cap, 1);
  assert.equal(at(3).stage, 0);
  assert.equal(at(3).stages, 4, 'the base record plus the three upgrades');
  assert.equal(at(4).cap, 2, 'the record unlocked at round 4 takes over');
  assert.equal(at(4).stage, 1);
  assert.equal(at(4).usesLeft, 2);
  assert.equal(at(8).cap, 3);
  assert.equal(at(8).stage, 2);
  assert.equal(at(12).cap, 4);
  assert.equal(at(20).stage, 3);
  assert.equal(at(20).cap, 4);
});

test('the live price (a cost that grows / falls) is the price the intent would charge', () => {
  assert.equal(view('band_lethania').cost, 1);
  assert.equal(view('band_lethania', { counters: 2 }).cost, 3);
});

test('only the local player\'s own editable prep offers the skill', () => {
  assert.equal(view('band_price', { m: { round: 3, phase: PHASE.BATTLE, dispatch: () => {} } }).available, false);
  assert.equal(view('band_price', { ready: true }).available, false);
  assert.equal(view('band_price', { alive: false }).available, false);
});
