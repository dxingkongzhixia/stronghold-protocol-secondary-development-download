// test/ui/regulation-ui.test.js — the 规程 UI suite: the models the version screens draw, fed with a real act3 match's
// own m.private / m.public frames. It wires the room level list, the briefing's core-bond choice, the prep's instruction
// offer and band-skill button, and the equipment report — so a server view or a UI model drifting apart fails here.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, setData, resetData } from '../../server/data.js';
import { makeMatch, DATA } from '../match/harness.js';
import { matchInfoModel } from '../../public/js/ui/matchInfo.js';
import { equipmentReport } from '../../public/js/ui/enemyDrawer.js';
import { bandSkillChessTargets, bandSkillShopTargets, bandSkillUsesText } from '../../public/js/ui/bandSkill.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
after(() => resetData());

const act3 = () => {
  const data = loadData(DIR, { log: quiet });
  setData(data);
  return data;
};

test('a 规程 match feeds the version models: core bonds, instruction offer, band skill, equipment report', () => {
  const data = act3();
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', humans: 1, seed: 11, data, fake: true });
  h.start();
  const m = h.m;
  const ps = h.ps('p_0');

  // ---- briefing (INFO_CHECK): the core-bond choice and the two-column info model
  const brief = ps.privateView();
  assert.equal(brief.coreBond.groups.length, 2);
  assert.equal(brief.coreBond.pick, null);
  const info = matchInfoModel(m.publicView(), {
    bonds: Object.values(data.bonds), chess: (id) => data.chess[id], mode: data.config.modes[m.modeId],
    priv: brief, diyData: { chess: data.chess, backups: data.backups },
  });
  assert.ok(info.core.length > 0, 'the 规程 core bonds');
  assert.ok(info.core.every((b) => typeof b.name === 'string'));
  assert.deepEqual(m.handle(ps.playerId, { t: 'g.coreBond', group: 0 }), { ok: true });
  assert.equal(ps.privateView().coreBond.pick, 0);

  // ---- prep: 追随者们 offers two instructions, the button has none until one is taken
  h.toPrep(1, { band: 'band_random' });
  const prep = ps.privateView();
  assert.equal(prep.bandChoice.candidates.length, 2);
  assert.equal(prep.bandSkill, null);
  assert.deepEqual(equipmentReport(prep), { area: [], holders: [], equipped: 0 });

  // an operator with one equipped item appears in the equipment report
  const chessId = Object.keys(data.chess).find((id) => data.chess[id].visible && !data.chess[id].isGolden);
  const itemId = Object.keys(data.items).find((id) => data.items[id].itemType === 'EQUIP');
  ps.hand.push({ uid: 9001, kind: 'chess', id: chessId, items: [{ uid: 9002, id: itemId }] });
  ps.recompute();
  const report = equipmentReport(ps.privateView());
  assert.equal(report.equipped, 1);
  assert.equal(report.holders[0].piece.uid, 9001);
  assert.equal(report.holders[0].items[0].id, itemId);

  // ---- take an instruction: the band-skill button and its target model follow the chosen strategy
  const pick = prep.bandChoice.candidates[0];
  assert.deepEqual(m.handle(ps.playerId, { t: 'g.bandSkillChoose', bandId: pick }), { ok: true });
  const v = ps.privateView();
  assert.equal(v.bandSkill.bandId, pick);
  assert.equal(v.bandSkill.name, data.bands[pick].effectName || data.bands[pick].name);
  assert.ok(['NO_TARGET', 'COMMON_CHESS', 'SHOP_SLOT', 'MAP_TILE'].includes(v.bandSkill.targetType));
  if (v.bandSkill.targetType === 'COMMON_CHESS') {
    assert.ok(bandSkillChessTargets(v).some((p) => p.uid === 9001), 'the hand operator is a target');
  }
  if (v.bandSkill.targetType === 'SHOP_SLOT') assert.ok(Array.isArray(bandSkillShopTargets(v)));
  assert.match(bandSkillUsesText(v.bandSkill), /^(×\d+|冷却 \d+|)$/);
});

test('the default 盟约 match exposes no version-only models', () => {
  setData(DATA);
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', humans: 1, seed: 13, data: DATA }).start();
  const v = h.ps('p_0').privateView();
  assert.equal(v.coreBond, null);
  assert.equal(v.bandSkill, null);
  assert.equal(v.bandChoice, null);
  assert.deepEqual(equipmentReport(v), { area: [], holders: [], equipped: 0 });
});
