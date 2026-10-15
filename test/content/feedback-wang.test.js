// 望 (chess_char_2027_wang, docs/MATCHMAKING.md §30) — the piece mechanic (kits/tier6.js `wang` +
// content/tokens.js `wangStone`): a deployable 装置 trap that links to a touching piece; every piece the owner brings
// in spawns one 跟子 on an adjacent tile (有敌人 > 无敌人 · 不可部署地面 > 可部署地面 > 可部署高台 · 上 > 右 > 下 > 左);
// an enemy stepping on a LINKED piece fires the SELECTED skill's trigger.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { TOKEN_IDS } from '../../server/sim/content/tokens.js';
import { COLS } from '../../server/sim/constants.js';

const REAL = { skip: !hasGeneratedData() };
const WANG = 'chess_char_2027_wang_a';
const PIECE = TOKEN_IDS.wangStone;
const living = (h) => h.b.allyUnits.filter((u) => u.defId === PIECE && u.alive);
const still = (key, o = {}) => enemyRec({ key, hp: 1e7, speed: 0, ...o });
/** 铸子 「相连时相互激活」: a piece that has ever touched another carries a latched axis (`mem.wangAxes`). */
const linked = (p) => !!(p.mem.wangAxes && (p.mem.wangAxes.v || p.mem.wangAxes.h));

test('望: a placed piece deploys a 跟子 on an adjacent tile; both are 装置 (untargetable, no attack)', REAL, () => {
  const h = makeBattle({
    units: [{ chessId: WANG, row: 10, col: 4, uid: 1, potential: 6 }, { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 6, uid: 2, potential: 6 }],
    autoFinish: false, timeLimit: 20,
  });
  h.step();
  const placed = h.b.allyUnits.find((u) => u.uid === 2);
  const pieces = living(h);
  assert.equal(pieces.length, 2, 'the placed piece + its 跟子');
  const follow = pieces.find((u) => u !== placed);
  assert.ok(follow.mem.wangFollow, 'the extra piece is the 跟子');
  assert.equal(Math.abs(follow.tileR - placed.tileR) + Math.abs(follow.tileC - placed.tileC), 1, 'orthogonally adjacent');
  for (const p of pieces) {
    assert.ok(p.findBuff('trait:untargetable'), '装置: 不可被选中');
    assert.equal(p.profile.noAttack, true, '装置: no normal attack');
  }
  checkInvariants(h.b);
});

test('望: the 跟子 prefers a non-deployable ground tile (不可部署地面 > 可部署地面 > 可部署高台 > dir order)', REAL, () => {
  // flatStage (10,10) is 'f' (LOW build NONE = 不可部署地面), while the "up" neighbour (11,9) is plain ground: the
  // deploy-class rule ranks the floor tile above the up neighbour
  const h = makeBattle({
    units: [{ chessId: WANG, row: 12, col: 4, uid: 1, potential: 6 }, { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 9, uid: 2, potential: 6 }],
    autoFinish: false, timeLimit: 20,
  });
  h.step();
  const follow = living(h).find((u) => u.mem.wangFollow);
  assert.ok(follow, 'the 跟子 exists');
  assert.deepEqual([follow.tileR, follow.tileC], [10, 10], 'on the non-deployable floor, not the up ground tile');
  checkInvariants(h.b);
});

test('望 S1 取势: the cast grants 2 more pieces (auto-deployed in range), each with its 跟子', REAL, () => {
  const h = makeBattle({
    units: [{ chessId: WANG, row: 10, col: 4, uid: 1, skillIndex: 0, potential: 6 }, { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 6, uid: 2, potential: 6 }],
    autoFinish: false, timeLimit: 30,
  });
  h.step();
  const w = h.unit(WANG);
  assert.equal(w.skill.id, 'skchr_wang_1', 'S1 selected');
  const before = living(h).length;            // placed piece + its 跟子
  assert.ok(before >= 2);
  w.skill.sp = w.skill.spCost;
  assert.ok(w.skill.activate('test', { free: true }));
  h.step();
  assert.ok(living(h).length >= before + 2, `S1 granted pieces (${before} → ${living(h).length})`);
  checkInvariants(h.b);
});

test('望: the piece trigger is the SELECTED skill (S1 sktok_wang_1 / S2 sktok_wang_2 / default S3 sktok_wang_3)', REAL, () => {
  const run = (skillIndex) => {
    const h = makeBattle({
      units: [{ chessId: WANG, row: 12, col: 4, uid: 1, ...(skillIndex == null ? {} : { skillIndex }), potential: 6 }, { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 6, uid: 2, potential: 6 }],
      autoFinish: false, timeLimit: 5,
    });
    h.step();
    const p = h.b.allyUnits.find((u) => u.uid === 2);
    return { id: p.skill.id, follow: h.b.allyUnits.find((u) => u.mem.wangFollow) };
  };
  assert.equal(run(0).id, 'sktok_wang_1', 'S1 取势');
  assert.equal(run(1).id, 'sktok_wang_2', 'S2 连星');
  assert.equal(run(null).id, 'sktok_wang_3', '默认 S3 天下劫');
  // the 跟子 carries the same trigger kit (spawned with an explicit kit)
  assert.ok(run(1).follow, 'the S2 跟子 exists');
});

test('望: activation is latched — a piece keeps its axis (and keeps triggering) after its neighbour is gone', REAL, () => {
  const h = makeBattle({
    defs: { enemies: { e: still('e') } },
    units: [
      { chessId: WANG, row: 12, col: 3, uid: 1, skillIndex: 0, potential: 6 },
      { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 6, uid: 2, potential: 6 },
      { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 7, uid: 3, potential: 6 },
    ],
    autoFinish: false, timeLimit: 20, captureNoisy: true, hooks: ['damaged', 'statusApplied'],
  });
  h.step();
  const a = h.b.allyUnits.find((u) => u.uid === 2), b = h.b.allyUnits.find((u) => u.uid === 3);
  assert.equal(a.mem.wangAxes.h, true, 'the 左右 touch latched the horizontal axis');
  h.b.retreat(b, { reason: 'expired', permanent: true });        // the neighbour disappears
  h.step();
  assert.equal(a.mem.wangAxes.h, true, 'the latch survives its neighbour');
  const foe = h.spawn('e', { pos: [10, 6] });
  assert.ok(h.runUntil(() => h.hooksOf('statusApplied').some((c) => c.status === 'sluggish' && c.source === a), 5), 'still triggers');
  assert.ok(!foe.alive || h.hooksOf('damaged').some((c) => c.source === a));
  checkInvariants(h.b);
});

test('望 第二天赋 料敌机先: the line adds +10 % damage per other piece (≤3) and ignores 9 RES', REAL, () => {
  const h = makeBattle({
    defs: { enemies: { e: still('e') } },
    units: [
      { chessId: WANG, row: 10, col: 4, uid: 1, skillIndex: 0, potential: 6 },   // S1: atk_scale 1.05
      { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 6, uid: 2, potential: 6 },
      { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 7, uid: 3, potential: 6 },
      { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 8, uid: 4, potential: 6 },
    ],
    autoFinish: false, timeLimit: 20, captureNoisy: true, hooks: ['damaged'],
  });
  h.step();
  const w = h.unit(WANG);
  const mid = h.b.allyUnits.find((u) => u.uid === 3);            // the middle of a 3-piece horizontal line (+ its 跟子 above)
  assert.equal(mid.mem.wangAxes.h, true);
  h.spawn('e', { pos: [10, 7] });
  assert.ok(h.runUntil(() => h.hooksOf('damaged').some((c) => c.source === mid && c.type === 'arts'), 5));
  const d = h.hooksOf('damaged').find((c) => c.source === mid && c.type === 'arts');
  // the continuous line through it: (10,6) (10,7) (10,8) + the 跟子 (11,7) = 4 pieces ⇒ stacks = min(3, 4 − 1) = 3 ⇒ ×1.36 (full potential)
  assert.ok(Math.abs(d.amount - w.s.atk * 1.05 * 1.36) < 1e-6, `line bonus (${d.amount} vs ${w.s.atk * 1.05 * 1.36})`);
  assert.equal(d.dmg.resIgnoreFlat, 10, '无视 10 点法抗 (临时法穿, full potential)');
  checkInvariants(h.b);
});

test('望 S3 天下劫: ammo 20, no normal attack, expanded range; the cast grants 8 pieces and spends bullets; stop returns the rest', REAL, () => {
  const cnt = (v) => Math.max(0, Math.floor(Number.isFinite(+v) ? +v : 0));
  const h = makeBattle({
    defs: { enemies: { e: still('e') } },
    units: [{ chessId: WANG, row: 10, col: 4, uid: 1, potential: 6 }, { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 6, uid: 2, potential: 6 }],
    autoFinish: false, timeLimit: 30, hooks: ['ammoUsed', 'attack'], captureNoisy: true,
  });
  h.step();
  const w = h.unit(WANG);
  assert.equal(w.skill.kind, 'ammo');
  assert.equal(w.skill.ammo, 20, '20 发弹药');
  w.skill.sp = w.skill.spCost;
  assert.ok(w.skill.activate('test', { free: true }));
  h.step();
  assert.ok(w.skill.active, 'S3 runs');
  assert.ok(w.rangeKeySet.has(10 * COLS + 8) && !w.baseRangeKeys.includes(10 * COLS + 8), '攻击范围扩大');
  const used = h.hooksOf('ammoUsed').filter((c) => c.unit === w).length;
  assert.ok(used >= 1, `the granted pieces spent bullets (${used})`);
  assert.ok(living(h).length <= 6, `never past the piece field cap (铸子 可以使用6枚棋子) — was ${living(h).length}`);
  assert.equal(w.skill.ammoLeft, 20 - used, 'ammo drains by the placements');
  h.run(2);
  assert.equal(h.hooksOf('attack').filter((c) => c.attacker === w).length, 0, '停止攻击');
  const total = () => living(h).length + cnt(w.mem.summonStock?.[PIECE]);
  const before = total();
  w.skill.stop();
  h.step();
  assert.equal(w.skill.active, false);
  assert.ok(total() >= before, '剩余弹药返还为棋子');
  checkInvariants(h.b);
});

test('望 S3 天下劫: a consumed piece is refilled while bullets last ("有空地就不断下棋子"); the skill ends when they run out', REAL, () => {
  const h = makeBattle({
    defs: { enemies: { e: still('e') } },
    units: [{ chessId: WANG, row: 10, col: 4, uid: 1, potential: 6 }],
    autoFinish: false, timeLimit: 60, captureNoisy: true, hooks: ['damaged', 'ammoUsed'],
  });
  h.step();
  const w = h.unit(WANG);
  w.skill.sp = w.skill.spCost;
  assert.ok(w.skill.activate('test', { free: true }));
  h.step();
  assert.ok(living(h).length >= 1, 'the cast deployed pieces');
  const left = () => Math.floor(Number(w.skill.ammoLeft) || 0);
  // an enemy on a piece detonates it (and every other piece its expanded range reaches); the field is refilled from the
  // bullets until none are left
  for (let i = 0; i < 40 && w.skill.active; i++) {
    const p = living(h)[0];
    if (!p) break;
    h.spawn('e', { pos: [p.tileR, p.tileC] });
    h.run(0.3);
  }
  assert.equal(left(), 0, 'the bullets ran out');
  assert.equal(w.skill.active, false, '弹药耗尽后技能结束');
  assert.ok(living(h).length <= 6, 'never more pieces than the piece deploy limit (铸子 可以使用6枚棋子)');
  checkInvariants(h.b);
});

// ── 「总有一个棋子不爆炸」 (owner playtest #7): the auto-placement must MIMIC the player's manual chain. Every piece the
// skill brings in (S1/S2/S3) and every piece the S3 refill drops must land 相连 to the field, or it can never trigger.
test('望: every piece an auto-cast brings in is 相连 (S1/S2/S3) — never a lone piece', REAL, () => {
  for (const skillIndex of [0, 1, null]) {
    const h = makeBattle({
      units: [{ chessId: WANG, row: 10, col: 4, uid: 1, ...(skillIndex == null ? {} : { skillIndex }), potential: 6 }],
      autoFinish: false, timeLimit: 30,
    });
    h.step();
    const w = h.unit(WANG);
    w.skill.sp = w.skill.spCost;
    assert.ok(w.skill.activate('test', { free: true }), `skill ${skillIndex} activates`);
    h.step();
    const pieces = living(h);
    // S1/S2 grant 2 pieces (+2 跟子 = 4); S3 grants 8 but the field cap (铸子 可以使用6枚棋子) stops at 6
    assert.equal(pieces.length, skillIndex == null ? 6 : 4, `skill ${skillIndex}: place count`);
    for (const p of pieces) assert.ok(linked(p), `skill ${skillIndex}: (${p.tileR},${p.tileC}) linked`);
    checkInvariants(h.b);
  }
});

test('望: the S3 refill keeps every living piece 相连 through the explosions ("有空地就不断下棋子")', REAL, () => {
  const h = makeBattle({
    defs: { enemies: { e: still('e') } },
    units: [{ chessId: WANG, row: 10, col: 4, uid: 1, potential: 6 }],
    autoFinish: false, timeLimit: 120, captureNoisy: true, hooks: ['damaged', 'ammoUsed', 'death'],
  });
  h.step();
  const w = h.unit(WANG);
  w.skill.sp = w.skill.spCost;
  assert.ok(w.skill.activate('test', { free: true }));
  h.step();
  const allLinked = () => living(h).every(linked);
  assert.ok(allLinked(), 'after the cast every piece is linked');
  // walk an enemy onto a piece: it (and every piece its expanded range reaches) detonates, then the field refills from the
  // bullets. No refill may drop a piece off the chain — that would be the owner's dead piece.
  for (let i = 0; i < 40 && w.skill.active; i++) {
    const p = living(h)[0];
    if (!p) break;
    h.spawn('e', { pos: [p.tileR, p.tileC] });
    h.run(0.3);
    assert.ok(allLinked(), `iteration ${i}: every living piece linked (${living(h).map((q) => `${q.tileR},${q.tileC}:${linked(q)}`).join(' ')})`);
  }
  assert.equal(Math.floor(Number(w.skill.ammoLeft) || 0), 0, 'the bullets ran out');
  assert.ok(living(h).length <= 6, 'never past the 6-piece field cap');
  checkInvariants(h.b);
});

test('望 S3: an enemy entering the board detonates every 相连 piece whose expanded range (x-6 十字) reaches it', REAL, () => {
  const h = makeBattle({
    defs: { enemies: { e: still('e') } },
    units: [
      { chessId: WANG, row: 12, col: 3, uid: 1, potential: 6 },
      { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 6, uid: 2, potential: 6 },
      { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 7, uid: 3, potential: 6 },
      { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 8, uid: 4, potential: 6 },
    ],
    autoFinish: false, timeLimit: 20, captureNoisy: true, hooks: ['damaged', 'death'],
  });
  h.step();
  assert.ok(living(h).every(linked), 'the opening line is linked');
  assert.equal(living(h).length, 6, 'three placed pieces + three 跟子');
  // the S3 trigger range is data `x-6` — a plus of radius 2, NOT the whole 5×5: every linked piece whose cross reaches the
  // foe must fire, the diagonal survivors stay (and stay linked)
  const CROSS = [[2, 0], [1, 0], [0, -2], [0, -1], [0, 0], [0, 1], [0, 2], [-1, 0], [-2, 0]];
  const reaches = (p) => CROSS.some(([dr, dc]) => p.tileR + dr === 10 && p.tileC + dc === 6);
  const doomed = living(h).filter(reaches);
  assert.ok(doomed.length >= 4, `several linked pieces reach the foe (${doomed.length})`);
  h.spawn('e', { pos: [10, 6] });
  assert.ok(h.runUntil(() => doomed.every((p) => !p.alive), 5), 'the enemy sets off every in-range linked piece');
  for (const p of living(h)) assert.ok(linked(p), `survivor (${p.tileR},${p.tileC}) stays linked`);
  assert.ok(h.hooksOf('damaged').some((c) => c.source?.defId === PIECE && c.type === 'arts'), 'the triggers deal arts damage');
  checkInvariants(h.b);
});

test('望: an enemy on a LINKED piece fires the selected skill trigger (S1 停顿 + arts); an unlinked piece does not', REAL, () => {
  // two pieces touching (10,6) & (10,7) are linked; an enemy walks onto the first
  const h = makeBattle({
    defs: { enemies: { e: still('e') } },
    units: [
      { chessId: WANG, row: 12, col: 3, uid: 1, skillIndex: 0, potential: 6 },
      { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 6, uid: 2, potential: 6 },
      { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 7, uid: 3, potential: 6 },
    ],
    enemies: [{ key: 'e', pos: [10, 6] }],
    autoFinish: false, timeLimit: 20,
    hooks: ['statusApplied', 'damaged'],
    captureNoisy: true,
  });
  h.step();
  const w = h.unit(WANG);
  assert.ok(h.runUntil(() => h.hooksOf('statusApplied').some((c) => c.status === 'sluggish' && c.source?.ownerUnit === w), 5), 'S1 停顿 fires');
  const dmg = h.hooksOf('damaged').filter((c) => c.source?.defId === PIECE && c.type === 'arts');
  assert.ok(dmg.length >= 1, 'the trigger deals arts damage');
  checkInvariants(h.b);
});

test('望: the piece has NO normal attack — its end is the trigger (champagneBomb consumed fx), never an "atk" event', REAL, () => {
  // The official token data has attackKind melee / atk 100 / empty trait, but the official prefab's Default mode has no
  // attack component (unlike 狼群/沙之碑): the piece only TRIGGERS. The trigger is its end, marked `consumed` so clients
  // play the explosion (its Attack clip), not a knock-out.
  const h = makeBattle({
    defs: { enemies: { e: still('e') } },
    units: [
      { chessId: WANG, row: 12, col: 3, uid: 1, skillIndex: 0, potential: 6 },
      { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 6, uid: 2, potential: 6 },
      { kind: 'token', tokenId: PIECE, ownerUid: 1, row: 10, col: 7, uid: 3, potential: 6 },
    ],
    enemies: [{ key: 'e', pos: [10, 6] }],
    autoFinish: false, timeLimit: 20,
    hooks: ['damaged', 'death'],
    captureNoisy: true,
  });
  h.step();
  const piece = h.b.allyUnits.find((u) => u.uid === 2);
  assert.equal(piece.profile.noAttack, true, '装置: no normal attack');
  assert.ok(h.runUntil(() => !piece.alive, 5), 'the piece is used up by its trigger');
  assert.equal(h.eventsOf('atk').filter((e) => e[1] === piece.id).length, 0, 'never an "atk" event (no normal attack)');
  const blast = h.eventsOf('fx').find((e) => e[1] === 'champagneBomb' && e[4]?.id === piece.id);
  assert.ok(blast, 'the trigger blast fx carries its id');
  assert.equal(blast[4].consumed, true, 'consumed: the trigger is its end (no death particles), its Attack clip plays');
  assert.equal(h.hooksOf('death').find((c) => c.unit === piece)?.reason, 'expired', 'consumed, not a knock-out');
  checkInvariants(h.b);
});
