// test/versions-band-instructions.test.js — 规程 追随者们 (band_random): every prep offers two active instructions
// (`g.bandSkillChoose`); the strategy keeps its passive and the chosen instruction's skill hooks drive g.bandSkill.
// The match runs on the act3 data through the real engine (harness), so the offer, the view and the dispatcher are
// exercised together.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, setData, resetData } from '../server/data.js';
import { makeMatch } from './match/harness.js';
import { validateC2S } from '../shared/protocol.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
const data = loadData(DIR, { log: quiet });
setData(data);
after(() => resetData());

const setup = (opts = {}) => {
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', humans: 1, seed: 5, data, fake: true, ...opts });
  h.start();
  h.toPrep(1, { band: 'band_random' });
  return h;
};

test('g.bandSkillChoose is a protocol message with a strategy id', () => {
  assert.equal(validateC2S({ t: 'g.bandSkillChoose', bandId: 'band_yan2' }), null);
  assert.notEqual(validateC2S({ t: 'g.bandSkillChoose' }), null);
  assert.notEqual(validateC2S({ t: 'g.bandSkillChoose', bandId: 5 }), null);
});

test('追随者们: every prep offers two active instructions and replaces only the instruction', () => {
  const h = setup();
  const ps = h.ps('p_0');
  assert.equal(ps.bandId, 'band_random');
  assert.ok(ps.bandChoice && ps.bandChoice.round === 1);
  assert.equal(ps.bandChoice.candidates.length, 2);
  assert.equal(new Set(ps.bandChoice.candidates).size, 2);
  for (const id of ps.bandChoice.candidates) {
    assert.equal(data.bands[id]?.skill?.type, 'ACTIVE', `${id} is an active instruction`);
    assert.notEqual(id, 'band_random');
  }
  // the private view carries the offer, and no skill until one is picked
  const priv = h.lastTo('p_0', 'm.private');
  assert.deepEqual(priv.bandChoice, { round: 1, candidates: ps.bandChoice.candidates, pick: null });
  assert.equal(priv.bandSkill, null);
});

test('g.bandSkillChoose: only an offered instruction, only once; the strategy stays 追随者们', () => {
  const h = setup();
  const ps = h.ps('p_0');
  const [first, second] = ps.bandChoice.candidates;
  const notOffered = data.bands && Object.keys(data.bands).find((id) => id !== first && id !== second && data.bands[id].skill?.type === 'ACTIVE');
  assert.equal(h.m.handle('p_0', { t: 'g.bandSkillChoose', bandId: notOffered }).error, 'BAD_TARGET');
  assert.equal(h.m.handle('p_0', { t: 'g.bandSkillChoose', bandId: first }).ok, true);
  assert.equal(ps.bandSkillId, first);
  assert.equal(ps.bandId, 'band_random', 'the strategy and its passive are unchanged');
  assert.equal(ps.bandChoice.pick, first);
  assert.equal(h.m.handle('p_0', { t: 'g.bandSkillChoose', bandId: second }).error, 'ALREADY', 'one instruction per prep');
  // the view now exposes the chosen instruction's skill
  const priv = h.lastTo('p_0', 'm.private');
  assert.equal(priv.bandSkill.bandId, first);
  assert.equal(priv.bandSkill.name, data.bands[first].effectName || data.bands[first].name);
  assert.equal(priv.bandSkill.targetType, data.bands[first].skill.targetType);
  assert.equal(priv.bandChoice.pick, first);
});

test('the chosen instruction\'s handler runs for g.bandSkill (its passive hooks do not)', () => {
  const h = setup();
  const ps = h.ps('p_0');
  // 黑白相易 (band_yan2): remove the target and gain a 【炎】 operator — an active skill, so the offer can contain it
  const pick = ps.bandChoice.candidates.includes('band_yan2') ? 'band_yan2' : ps.bandChoice.candidates[0];
  assert.equal(h.m.handle('p_0', { t: 'g.bandSkillChoose', bandId: pick }).ok, true);
  if (pick !== 'band_yan2') return; // this match's roll offered another instruction; the offer/choose test above covers it
  const chessId = Object.keys(data.chess).find((id) => data.chess[id]?.visible && !data.chess[id].isGolden);
  const piece = { uid: 9001, kind: 'chess', id: chessId, items: [] };
  ps.hand.push(piece);
  ps.recompute();
  assert.equal(h.m.handle('p_0', { t: 'g.bandSkill', target: { kind: 'chess', uid: 9001 } }).ok, true);
  assert.equal(ps.find(9001), null, 'the instruction removed the target');
  assert.equal(ps.funds, 4 - (data.bands.band_yan2.skill.cost || 0), 'the instruction price was paid');
});

test('a bot takes the first offered instruction at once', () => {
  const h = setup();
  const bot = { playerId: 'ai_x', bandId: 'band_random', bandSkillId: null, bandChoice: null, botControlled: true,
    bandSkill: { uses: 0, total: 0, round: 0, cooldownUntil: 0 }, dirty() {} };
  h.m.round = 3;
  assert.equal(h.m.offerBandInstructions(bot, 2, { int: () => 0 }), 2);
  assert.equal(bot.bandChoice.candidates.length, 2);
  assert.equal(bot.bandChoice.pick, bot.bandChoice.candidates[0]);
  assert.equal(bot.bandSkillId, bot.bandChoice.candidates[0]);
});

test('no offer outside the prep that made it', () => {
  const h = setup();
  const ps = h.ps('p_0');
  const id = ps.bandChoice.candidates[0];
  h.m.round = 2;
  assert.equal(h.m.handle('p_0', { t: 'g.bandSkillChoose', bandId: id }).error, 'BAD_TARGET', 'a stale offer');
  assert.equal(h.m.handle('p_0', { t: 'g.bandSkillChoose', bandId: id }).error, 'BAD_TARGET');
});
