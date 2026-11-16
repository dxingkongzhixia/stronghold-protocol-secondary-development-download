// 暴躁铁皮 + 简易通讯机 (规程): the communicator recruits the carrier's FIRST-bond operators at or below the shop level,
// and the profile's `recruitTierExempt` lets that marked hidden normal form (暴躁铁皮, tier 5) bypass only the tier gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getVersionData } from '../../server/data.js';
import { createRegistry, makeCtx } from '../../server/match/effectsMeta.js';
import { registerBuiltins } from '../../server/match/builtinMeta.js';
import { makeMatch, give, giveItem } from './harness.js';

const V3 = getVersionData('act3autochess@V3_1', { log: { warn() {}, error() {}, info() {} } });
const NORMAL = 'chess_char_5_22_a', ELITE = 'chess_char_5_22_b';
const PHONE = 'chess_item_2_06_e_a', GOLD_PHONE = 'chess_item_2_06_e_b';
const equipment = Object.values(V3.items).filter((i) => i.itemType === 'EQUIP' && !i.isGolden && !i.canFuse && !i.canGiveBond
  && !String(i.kind).startsWith('consume_on_equip')).slice(0, 7).map((i) => i.id);
const owned = (ps) => [...ps.board.values(), ...ps.hand, ...ps.temp].filter((p) => p?.kind === 'chess');
const copies = (ps) => owned(ps).filter((p) => ps.gd.baseIdOf(p.id) === NORMAL)
  .reduce((n, p) => n + (ps.gd.isGolden(p.id) ? 3 : 1), 0);

function setup(t) {
  const registry = createRegistry({ builtins: false, content: false });
  registerBuiltins(registry, V3);
  const h = makeMatch({ data: V3, mode: 'solo', modeId: 'mode_single_1', seed: 41, fake: true, registry }).start();
  t.after(() => h.m.dispose());
  h.toPrep(1, { band: 'band_amiya' });
  const ps = h.ps('p_0');
  ps.shop.level = 2;
  const equip = (it, p) => ps.equip(it.uid, p.uid);
  return { h, m: h.m, ps, equip };
}

for (const id of [NORMAL, ELITE]) for (const [phone, n] of [[PHONE, 1], [GOLD_PHONE, 2]]) {
  test(`${id} + ${phone}: shop II grants ${n} special copies without destroying free-slot equipment`, (t) => {
    const { h, m, ps, equip } = setup(t);
    const target = give(m, ps, id);
    const worn = equipment.slice(0, 2).map((i) => giveItem(m, ps, i));
    for (const it of worn) assert.ok(equip(it, target).ok);
    const before = copies(ps), it = giveItem(m, ps, phone);
    assert.equal(m.pool.has(NORMAL), false);
    assert.ok(equip(it, target).ok);
    assert.equal(ps.find(it.uid), null);
    assert.equal(copies(ps), before + n, 'advanced phone counts both gifts even when they immediately merge');
    for (const item of worn) assert.ok(ps.find(item.uid), 'a gift-triggered promotion returns equipment instead of destroying it');
    assert.equal(m.pool.has(NORMAL), false, 'special recruitment never adds Ironhide to shop stock');
    h.invariants();
  });
}

test('two normal communicators at shop II promote the strategy carrier and return both equipped items', (t) => {
  const { h, m, ps, equip } = setup(t);
  const target = give(m, ps, NORMAL);
  const worn = equipment.slice(0, 2).map((i) => giveItem(m, ps, i));
  for (const it of worn) assert.ok(equip(it, target).ok);
  for (let i = 0; i < 2; i++) assert.ok(equip(giveItem(m, ps, PHONE), target).ok);
  assert.equal(ps.find(target.uid), null);
  const elite = owned(ps).filter((p) => p.id === ELITE);
  assert.equal(elite.length, 1);
  assert.equal(ps.gd.equipSlotsOf(elite[0].id), 6);
  assert.equal(copies(ps), 3);
  for (const it of worn) assert.ok(ps.find(it.uid));
  h.invariants();
});

test('only the marked carrier copy bypasses tier; regular recruits and shop draws keep their limits', (t) => {
  const { m, ps, equip } = setup(t);
  const ctx = makeCtx(m, ps, { kind: 'item', key: PHONE }, 'onEquip');
  const calls = [], roll = m.pool.roll.bind(m.pool);
  m.pool.roll = (rng, opts) => { calls.push(opts); return roll(rng, opts); };
  const target = give(m, ps, NORMAL);
  assert.ok(equip(giveItem(m, ps, PHONE), target).ok);
  const last = calls.at(-1);
  assert.equal(last.maxTier, 2, 'do not remove the level gate from normal candidates');
  assert.deepEqual(last.extra.filter(([, e]) => e.tierExempt).map(([id]) => id), [NORMAL]);
  assert.equal(last.extra.find(([id]) => id === NORMAL)[1].tier, 5, 'keep the actual tier instead of disguising it as tier II');
  assert.equal(roll(() => 0, { ...last, tier: 2, filter: (id) => id === NORMAL }), null, 'the exception never bypasses an exact-tier draw');
  assert.equal(roll(() => 0, { ...last, tier: 5, filter: (id) => id === NORMAL }), NORMAL);
  ctx.rollChess({ maxTier: 2 });
  assert.ok(!(calls.at(-1).extra || []).some(([id]) => id === NORMAL));
  const unmarked = Object.values(V3.chess).find((c) => c.isHidden && !c.isGolden && c.recruitTierExempt !== true && !c.isDiy)?.chessId;
  if (unmarked) {
    ctx.rollChess({ maxTier: 2, tierExemptChess: [unmarked] });
    assert.ok(!(calls.at(-1).extra || []).some(([, e]) => e.tierExempt), 'unmarked hidden operators do not inherit this exception');
  }
});

test('a full four-slot carrier replaces the chosen item before a communicator-triggered promotion', (t) => {
  const { h, m, ps, equip } = setup(t);
  const target = give(m, ps, NORMAL);
  const worn = equipment.slice(0, 4).map((i) => giveItem(m, ps, i));
  for (const it of worn) assert.ok(equip(it, target).ok);
  const eq = ps.equip(giveItem(m, ps, GOLD_PHONE).uid, target.uid, worn[1].uid);
  assert.ok(eq.ok);
  assert.equal(ps.find(worn[1].uid), null, 'the selected item is destroyed normally');
  for (const it of worn.filter((x) => x !== worn[1])) assert.ok(ps.find(it.uid), 'promotion returns every other equipped item');
  assert.equal(owned(ps).filter((p) => p.id === ELITE).length, 1);
  h.invariants();
});
