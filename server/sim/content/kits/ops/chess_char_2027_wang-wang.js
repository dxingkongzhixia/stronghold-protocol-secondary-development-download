// server/sim/content/kits/ops/chess_char_2027_wang-wang.js — 望 (char_2027_wang) kit, tier 6 (custom:
// tools/build-data.mjs CUSTOM_CHESS). Relocated from the pre-0.2.0 kits/tier6.js; kit contract and rules: ../README.md.

import { COLS } from '../../../constants.js';
import { rotateOffset, localOrder } from '../../../dir.js';
import { bodyOnTile } from '../../../body.js';
import { TOKEN_IDS, wangStone as wangStoneKit } from '../../tokens.js';

// helpers (kit-local: not exported by ../shared/tierN.js)

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

const tbb = (def, i) => (def && def.talents && def.talents[i] && def.talents[i].bb) || {};

const STATE = new WeakMap();
/** Per-battle shared state for kits (trackers registered once per battle). */
function bstate(battle) {
  let s = STATE.get(battle);
  if (!s) { s = {}; STATE.set(battle, s); }
  return s;
}

const skillGridOf = (def) => (def?.skill?.rangeGrid?.length ? def.skill.rangeGrid : null);

const live = (u) => !!u && u.alive && u.deployed && !u.removed && !u.hidden;

// 望 chess_char_2027_wang (特种·陷阱师) — S1 取势 / S2 连星 / S3 天下劫; 铸子; 料敌机先
//
// His 棋子 (token_10064_wang_stone1, content/tokens.js `wangStone`) are deployable 装置 traps: a piece only TRIGGERS
// while it touches another piece of the same owner (相连 = 相互激活), and an enemy stepping on an active piece's tile
// fires the effect of 望's SELECTED skill. This kit is the owner side of the mechanic (docs/MATCHMAKING.md §30):
//   * every skill's active effect is just "获得 N 枚棋子": the pieces join the owner's summon stock and, because the
//     battle is deterministic and auto-simulated here (a hand card cannot be placed mid-battle), deploy at once inside
//     the attack range — S3 first on the tiles enemies stand on (where a piece may be placed at all);
//   * "手动部署棋子时，望在相邻位置额外部署一枚棋子（跟子）": every piece brought in (the board pieces the hand placed, and
//     the skill's pieces, which in-game the player also places by hand) gets one follow-piece on an adjacent tile by the
//     official priority (有敌人 > 无敌人 · 不可部署地面 > 可部署地面 > 可部署高台 · 上 > 右 > 下 > 左), up to 铸子's 最多9枚.
//     The follow-piece carries the SAME trigger kit as the piece it follows (按所选技能传触发).
function wang(bb, chess, def) {
  const t0 = tbb(def, 0);
  const tok = TOKEN_IDS.wangStone;
  const spawnCap = Math.max(0, Math.floor(num(t0['attack@max_spawn_cnt'], 9)));          // 跟子 最多9枚
  /** "最多拥有7枚" — the TOKEN's own deck stack cap (data, not the operator's 0). */
  const stockCapOf = (battle, unit) => Math.max(1, Math.floor(num(battle.tokenDef?.(tok, unit)?.stats?.deckStack, 7)));
  /** The pieces this owner holds ON THE FIELD. 铸子 "可以使用6枚棋子": placing beyond the token's own `deployLimit`
   *  makes tokens.js WITHDRAW the oldest piece — a placement that costs a bullet and changes nothing. */
  const heldPieces = (battle, unit) => battle.allyUnits.filter((t) => t.alive && t.kind === 'token' && t.defId === tok && t.ownerUnit === unit);
  const fieldCapOf = (battle, unit) => Math.max(1, Math.floor(num(battle.tokenDef?.(tok, unit)?.stats?.deployLimit, 6)));
  /** Per-battle follow-piece guard (a follow-piece never spawns another). */
  const wstate = (battle) => {
    const s = bstate(battle);
    return s.wang || (s.wang = { busy: false });
  };
  /** The trigger kit of a piece, per 望's SELECTED skill (the token def's own `bySkill` variant bb). */
  const triggerKit = (battle, unit) => {
    let bbTok = null;
    try { bbTok = battle.tokenDef?.(tok, unit)?.skill?.bb ?? null; } catch { bbTok = null; }
    return { ...wangStoneKit(bbTok ?? {}), fromTokens: true };
  };
  const enemyOn = (battle, r, c) => battle.enemies.some((e) => e.alive && !e.hidden && bodyOnTile(e, r, c));
  /** S3 天下劫 runs (stopped attacking, 20 bullets): its extra placements spend the bullets. */
  const s3Active = (unit) => {
    const s = unit.skill;
    return !!s && s.active && s.kind === 'ammo' && s.id === 'skchr_wang_3';
  };
  const spendAmmo = (battle, unit) => {
    const s = unit.skill;
    if (!s || !s.active || s.kind !== 'ammo') return;
    s.ammoLeft -= 1;
    unit.mem.wangAmmo = s.ammoLeft;
    battle.emit('ammoUsed', { unit, left: s.ammoLeft, skill: s });
    if (s.ammoLeft <= 0) s.end('ammo');   // 弹药耗尽后技能结束
  };
  /** 跟子: one extra piece on the best adjacent tile of `piece` (see the priority above). */
  const spawnFollow = (battle, unit, piece) => {
    const st = wstate(battle);
    if (st.busy) return;
    const mine = battle.allyUnits.filter((t) => t.kind === 'token' && t.defId === tok && t.ownerUnit === unit && t.mem.wangFollow && t.alive);
    if (mine.length >= spawnCap) return;
    if (heldPieces(battle, unit).length >= fieldCapOf(battle, unit)) return;   // a full field would just withdraw another piece for a bullet
    if (s3Active(unit) && Math.floor(num(unit.mem.wangS3Follows, 0)) >= 3) return; // S3: 第一天赋额外至多3枚
    // 上 > 右 > 下 > 左 in the piece's own (facing) frame — a turned board plays alike (sim/dir.js)
    const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    let best = null, bestS = null;
    for (let i = 0; i < DIRS.length; i++) {
      const [adr, adc] = rotateOffset(DIRS[i][0], DIRS[i][1], piece.dir ?? unit.dir);
      const r = piece.tileR + adr, c = piece.tileC + adc;
      if (!battle.grid.inRect(r, c) || battle.isReservedTile(r, c)) continue;
      const ally = battle.unitAt?.(r, c);
      if (ally && ally.alive) continue;                 // never overwrite an ally
      const ground = battle.grid.canStand(r, c, { ranged: false });
      const high = battle.grid.canStand(r, c, { ranged: true });
      if (!ground && !high && !battle.grid.isLow(r, c)) continue; // no void / forbidden tile
      const cls = ground ? 1 : (battle.grid.isLow(r, c) ? 0 : 2); // 不可部署地面 > 可部署地面 > 可部署高台
      const score = [enemyOn(battle, r, c) ? 0 : 1, cls, i];
      if (!bestS || score[0] < bestS[0] || (score[0] === bestS[0] && (score[1] < bestS[1] || (score[1] === bestS[1] && score[2] < bestS[2])))) {
        best = [r, c]; bestS = score;
      }
    }
    if (!best) return;
    st.busy = true;
    let f = null;
    try { f = battle.spawnToken(unit, tok, best[0], best[1], { force: true, kit: triggerKit(battle, unit) }); }
    finally { st.busy = false; }
    if (f) {
      f.mem.wangFollow = true;
      if (s3Active(unit)) { unit.mem.wangS3Follows = Math.floor(num(unit.mem.wangS3Follows, 0)) + 1; spendAmmo(battle, unit); }
      battle.fx('summon', { x: f.x, y: f.y, id: f.id, src: unit.id });
    }
  };
  /** Tiles of 望's attack range a piece may take (S3: the tiles enemies stand on first), in 望's facing frame. */
  const placeTiles = (battle, unit, { enemiesFirst = false } = {}) => {
    const keys = unit.rangeKeys || [];
    const byLocal = (a, b) => {
      const la = localOrder(a[0] - unit.tileR, a[1] - unit.tileC, unit.dir);
      const lb = localOrder(b[0] - unit.tileR, b[1] - unit.tileC, unit.dir);
      return la[0] - lb[0] || la[1] - lb[1];
    };
    const enemyTiles = [];
    const regular = [];
    if (enemiesFirst) {
      for (const k of keys) {
        const r = (k / COLS) | 0, c = k % COLS;
        if (battle.grid.inRect(r, c) && enemyOn(battle, r, c) && !battle.unitAt?.(r, c)?.alive) enemyTiles.push([r, c]);
      }
      enemyTiles.sort(byLocal);
    }
    for (const k of keys) {
      const r = (k / COLS) | 0, c = k % COLS;
      if (!battle.grid.inRect(r, c) || battle.isReservedTile(r, c)) continue;
      if (!battle.grid.canStand(r, c, { ranged: true })) continue;
      regular.push([r, c]);
    }
    regular.sort(byLocal);
    const out = [], seen = new Set();
    for (const [r, c] of [...enemyTiles, ...regular]) { const k = r * COLS + c; if (!seen.has(k) && out.length < 64) { seen.add(k); out.push([r, c]); } }
    return out;
  };
  /** "获得 N 枚棋子": to the stock, then deploy every stock piece the range still holds. */
  const deployStock = (battle, unit) => {
    const stock = unit.mem.summonStock;
    if (!stock) return;
    const s3 = unit.skill?.id === 'skchr_wang_3';
    const kit = triggerKit(battle, unit);
    let left = Math.max(0, Math.floor(num(stock[tok], 0)));
    for (const [r, c] of placeTiles(battle, unit, { enemiesFirst: s3 })) {
      if (left <= 0) break;
      if (heldPieces(battle, unit).length >= fieldCapOf(battle, unit)) break;   // never place past the field cap (drops nothing)
      const p = battle.spawnToken(unit, tok, r, c, { kit });
      if (p) {
        left--;
        if (s3Active(unit)) spendAmmo(battle, unit);
      }
    }
    stock[tok] = left;
  };
  const givePieces = (battle, unit, n) => {
    if (!(n > 0)) return;
    const stock = unit.mem.summonStock || (unit.mem.summonStock = {});
    stock[tok] = Math.min(stockCapOf(battle, unit), Math.floor(num(stock[tok], 0)) + n);
    deployStock(battle, unit);
  };
  const give = (n) => ({ battle, unit }) => givePieces(battle, unit, Math.max(0, Math.floor(n)));
  const cnt = Math.max(0, Math.floor(num(bb.cnt, 0)));
  const skills = {
    // S1 取势 / S2 连星 (自动): "立即获得2枚棋子"; the trigger rides the token's bySkill variant (停顿 / 连星)
    skchr_wang_1: { kind: 'instant', onStart: give(cnt || 2) },
    skchr_wang_2: { kind: 'instant', onStart: give(cnt || 2) },
  };
  const skillGrid = skillGridOf(def);
  return {
    skills,
    install(battle, unit) {
      battle.on('deploy', ({ unit: u }) => {
        if (u.kind !== 'token' || u.defId !== tok || u.ownerUnit !== unit) return;
        if (u.mem.wangFollow) return;
        spawnFollow(battle, unit, u);
      }, { owner: unit });
      // S3 天下劫 "有空地就不断下棋子": while the skill runs, the field is continuously refilled — every free tile of the
      // expanded range takes a piece (铺满 or 弹药耗尽, whichever comes first) as pieces explode. Bounded by the piece's
      // own per-owner deploy limit (铸子 "可以使用6枚棋子"), or a placement would just withdraw the oldest piece and burn
      // a bullet for nothing. Runs on a short interval so one tick never spawns the whole budget at once.
      battle.every(0.25, () => {
        if (!s3Active(unit)) return;
        const lim = Math.max(1, Math.floor(num(battle.tokenDef?.(tok, unit)?.stats?.deployLimit, 6)));
        const mine = () => battle.allyUnits.filter((t) => t.alive && t.kind === 'token' && t.defId === tok && t.ownerUnit === unit);
        for (const [r, c] of placeTiles(battle, unit, { enemiesFirst: true })) {
          if (Math.floor(num(unit.skill?.ammoLeft, 0)) <= 0) break;
          const held = mine();
          if (held.length >= lim) break;
          if (held.some((t) => t.tileR === r && t.tileC === c) || battle.unitAt?.(r, c)?.alive) continue;
          const p = battle.spawnToken(unit, tok, r, c, { kit: triggerKit(battle, unit) });
          if (p) spendAmmo(battle, unit);
        }
      }, { owner: unit });
      // S3 "棋子耗尽后技能结束": no piece left on the field and none in stock while it runs
      battle.every(0.5, () => {
        if (!s3Active(unit)) return;
        const field = battle.allyUnits.some((t) => t.alive && t.kind === 'token' && t.defId === tok && t.ownerUnit === unit);
        if (!field && Math.floor(num(unit.mem.summonStock?.[tok], 0)) <= 0) unit.skill.end('ammo');
      }, { owner: unit });
    },
    // S3 天下劫 (默认): 停止攻击、攻击范围扩大；立即获得8枚棋子（优先部署在范围内敌人所在位置）；20 发弹药
    skill: {
      kind: 'ammo',
      ammo: Math.max(1, Math.floor(num(bb.trigger_time, 20))),
      attack: { noAttack: true },
      ...(skillGrid ? { targeting: { rangeGrid: skillGrid } } : {}),
      onStart({ battle, unit }) {
        unit.mem.wangS3Follows = 0;
        unit.mem.wangAmmo = Math.max(0, Math.floor(num(unit.skill?.ammoLeft, num(bb.trigger_time, 20))));
        givePieces(battle, unit, cnt || 8);
      },
      onEnd({ battle, unit, reason }) {
        // `SkillRuntime.end` already zeroed ammoLeft: the ammo we knew (wangAmmo) is the remainder → 返还为棋子
        const left = Math.max(0, Math.floor(num(unit.mem.wangAmmo, 0)));
        unit.mem.wangAmmo = 0;
        if (left <= 0 || reason === 'death' || !live(unit)) return;
        const stock = unit.mem.summonStock || (unit.mem.summonStock = {});
        stock[tok] = Math.min(stockCapOf(battle, unit), Math.floor(num(stock[tok], 0)) + left);
        deployStock(battle, unit);
      },
    },
    talents: [],
  };
}

export default {
  chess_char_2027_wang_a: wang,
};
