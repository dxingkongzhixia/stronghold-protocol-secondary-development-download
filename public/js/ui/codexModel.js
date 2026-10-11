// public/js/ui/codexModel.js — 资料库 (盟约与策略总览 / 悬赏敌人池): the pure data mapping behind the codex overlay
// (public/js/ui/codex.js).
//
// Everything here is derived from the generated data the game already loads — bonds.json, bands.json, items.json,
// chess.json, bosses.json, enemies.json, choices.json, config.json — never a hardcoded list, so a new bond / strategy /
// boss / bounty card shows up on its own. No DOM, no Preact: the same functions are unit-tested in Node
// (test/ui/codex.test.js) and called by the overlay.
//
// The 悬赏 finding (docs/CONTENT-AUTHORING.md §4): the two "phases" of the leader hunt are FINAL_ASSAULT (最终攻势, the
// `bossWeights` pool) and HIDDEN_CORE (隐秘核心, the `hiddenBossWeights` pool). That phase→pool mapping is DATA:
// config.json `modes[modeId].bossWeights` / `.hiddenBossWeights`, applied on the `hidden` flag of bosses.json by
// server/match/waves.js `setupMatchWaves` + server/match/gamedata.js `bossWeights`. bosses.json carries the weights'
// enemies, escorts and abilities. The 悬赏决策 card drafts (choices.json `bountyDrafts`, kinds initial / boss / hunter)
// are a separate, card-based bounty mechanic and are surfaced next to the boss pools.

import { richTextPlain, formatBondEffect } from './richText.js';

const s = (v) => (typeof v === 'string' ? v : '');
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' ? v : null);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
/** A base (non-elite) chess id: `_b` (进阶/preview) → `_a`. */
export const baseChessId = (id) => s(id).replace(/_b$/, '_a');

// ---- 盟约 (bonds) -----------------------------------------------------------------------------------

/** 'core' (核心盟约) | 'addon' (附加盟约). */
export const bondKind = (b) => (b && b.isCore ? 'core' : 'addon');

/** 'battle' (战斗中生效, `activeType` BATTLE/MANI …) | 'alltime' (全程生效, `activeType` ALL — 休整期也在). */
export function bondScope(b) {
  return s(b && b.activeType).toUpperCase() === 'ALL' ? 'alltime' : 'battle';
}

/**
 * The activation stages of a bond, one per threshold: `{ index (1-based), threshold, maxCount, need, effect }`.
 * `need` / `effect` come from the bond's `spec.tiers` (the research implementer spec, English) when present — the
 * official per-stage text is embedded in the bond's full description (descRaw), shown whole next to this list.
 */
export function bondStages(b) {
  const th = arr(b && b.thresholds);
  const spec = arr(b && b.spec && b.spec.tiers);
  return th.map((n, i) => ({
    index: i + 1,
    threshold: num(n),
    maxCount: b && b.maxCount != null && Number.isFinite(Number(b.maxCount)) ? Number(b.maxCount) : null,
    need: s(spec[i] && spec[i].need) || (b && b.maxCount != null ? `${num(n)} 名及以下` : `${num(n)} 名`), // i18n-ignore: spec / fallback
    effect: s(spec[i] && spec[i].effect),
  }));
}

/** The layer milestones (`layerMilestones`): `{ layer, mode ('every'|'reach'|'first'), effect }`. */
export function bondMilestones(b) {
  return arr(b && b.layerMilestones).map((m, i) => ({
    index: i + 1, layer: num(m && m.layer), mode: s(m && m.mode), effect: s(m && m.effect),
  }));
}

/**
 * The bond's in-battle effect text with its layer-scaled numbers resolved at `layers` (richText.js formatBondEffect:
 * `bb[base] + bb[perStack] × layers`); the official markup is kept for the UI to render.
 */
export function bondEffect(b, layers = 0) {
  return formatBondEffect(b, layers);
}

/**
 * Equipment related to a bond, from items.json:
 *   grants   — items with `giveBondId === bondId` (变形同构体 / 盟约授予装备: an item that makes its wearer a member;
 *              items with `canGiveBond` are the 变形同构体 pairing itself and are left out, like gameLogic grantedBonds),
 *   requires — items with `requiresBondId === bondId` (装备 requires a bond member).
 * One entry per item family (`baseId`), the non-golden copy first; `{ item, golden, family }`.
 */
export function bondEquipment(items, bondId) {
  const id = s(bondId);
  const groups = { grants: new Map(), requires: new Map() };
  for (const it of arr(items)) {
    if (!it || it.canGiveBond) continue;
    const bucket = it.giveBondId === id ? groups.grants : it.requiresBondId === id ? groups.requires : null;
    if (!bucket) continue;
    const fam = s(it.baseId) || s(it.id);
    const cur = bucket.get(fam);
    if (!cur) bucket.set(fam, { item: it, golden: !!it.isGolden, family: fam });
    else if (cur.golden && !it.isGolden) bucket.set(fam, { item: it, golden: false, family: fam });
  }
  const drain = (m) => [...m.values()].sort((a, b) => (a.item.tier | 0) - (b.item.tier | 0) || (a.family < b.family ? -1 : 1));
  return { grants: drain(groups.grants), requires: drain(groups.requires) };
}

/**
 * Chess records that are members of a bond: the bond record's `members` (or `visibleMembers` when that is all it has)
 * resolved against the data, deduped by base id, sorted by tier. A second, reverse derivation —
 * `chessCarryingBond` (chess.json `bonds`) — is the members-from-chess relationship the task names; the two agree (a
 * test pins it).
 */
export function bondMembers(b, chess) {
  const byBase = new Map();
  const byId = new Map();
  for (const c of arr(chess)) {
    if (!c || !s(c.chessId)) continue;
    byId.set(c.chessId, c);
    const base = baseChessId(c.chessId);
    if (!byBase.has(base) || c.isGolden) byBase.set(base, c);
  }
  const ids = arr(b && b.members).length ? arr(b.members) : arr(b.visibleMembers);
  const out = [];
  const seen = new Set();
  for (const id of ids) {
    const base = baseChessId(id);
    if (seen.has(base)) continue;
    seen.add(base);
    const c = byId.get(id) || byId.get(base) || byBase.get(base);
    if (c) out.push(c);
  }
  return out.sort((a, b) => (a.tier | 0) - (b.tier | 0) || (s(a.chessId) < s(b.chessId) ? -1 : 1));
}

/** Members derived the other way: chess records whose `bonds` carries `bondId` (base-deduped, by tier). */
export function chessCarryingBond(chess, bondId) {
  const id = s(bondId);
  return arr(chess).filter((c) => c && arr(c.bonds).includes(id))
    .sort((a, b) => (a.tier | 0) - (b.tier | 0) || (s(a.chessId) < s(b.chessId) ? -1 : 1));
}

/**
 * Does a bond match a free-text query? Case-insensitive over its name / id, its descriptions (markup stripped) and,
 * when `members` (names or records) is given, its members' names.
 */
export function bondMatches(b, query, members = []) {
  const q = s(query).trim().toLowerCase();
  if (!q) return true;
  const names = arr(members).map((m) => (typeof m === 'string' ? m : s(m && m.name)));
  const hay = [
    s(b && b.name), s(b && b.bondId), s(b && b.identifier),
    richTextPlain(b && b.descRaw), richTextPlain(b && b.desc),
    richTextPlain(b && b.effectDescRaw), richTextPlain(b && b.effectDesc),
    ...names,
  ].join(' ').toLowerCase();
  return hay.includes(q);
}

/**
 * Filter bonds for the grid: `kind` 'all'|'core'|'addon', `scope` 'all'|'battle'|'alltime', a free-text `query`, and
 * an optional `membersOf(bondId) => names` for the member search. Result kept in 核心-first data order.
 * @param {any[]} bonds bonds.json records (data.list('bonds'))
 */
export function filterBonds(bonds, { kind = 'all', scope = 'all', query = '', membersOf = null } = {}) {
  return arr(bonds).filter((b) => {
    if (!b) return false;
    if (kind !== 'all' && bondKind(b) !== kind) return false;
    if (scope !== 'all' && bondScope(b) !== scope) return false;
    if (!s(query).trim()) return true;
    return bondMatches(b, query, membersOf ? membersOf(b.bondId) : []);
  });
}

/** The full codex view of one bond (equipment / members / stages / effects). */
export function bondView(b, { items = [], chess = [], layers = 0 } = {}) {
  const equip = bondEquipment(items, b && b.bondId);
  return {
    bond: b,
    bondId: s(b && b.bondId),
    name: s(b && b.name),
    isCore: !!(b && b.isCore),
    kind: bondKind(b),
    scope: bondScope(b),
    iconId: s(b && b.iconId),
    countsHand: !!(b && b.countsHand),
    noStack: !!(b && b.noStack),
    thresholds: arr(b && b.thresholds).map(num),
    stages: bondStages(b),
    milestones: bondMilestones(b),
    effectBase: bondEffect(b, 0),
    effectAt: bondEffect(b, layers),
    effectFull: s(b && (b.effectDescRaw || b.effectDesc)),
    desc: s(b && (b.descRaw || b.desc)),
    equipment: equip,
    members: bondMembers(b, chess),
    spec: obj(b && b.spec),
  };
}

// ---- 策略 (bands / strategies) ----------------------------------------------------------------------

/** The strategy's effect text (descRaw, else desc). */
export const bandEffect = (b) => s(b && (b.descRaw || b.desc));

/** The bond ids a strategy is built around (`bondIds`, shared/bandBonds.js at build time). */
export const bandBondIds = (b) => arr(b && b.bondIds).filter((x) => typeof x === 'string');

/** The keys of a strategy's buff handlers (`buffs[].key` — server/sim/content/bands/**). */
export const bandBuffKeys = (b) => arr(b && b.buffs).map((x) => s(x && x.key)).filter(Boolean);

/** Does a strategy match `query` (name / effect / id / related bond names)? */
export function bandMatches(b, query, bondNames = []) {
  const q = s(query).trim().toLowerCase();
  if (!q) return true;
  const hay = [
    s(b && b.name), s(b && b.bandId), s(b && b.effectName), richTextPlain(bandEffect(b)),
    ...arr(bondNames),
  ].join(' ').toLowerCase();
  return hay.includes(q);
}

/**
 * Filter strategies: a free-text `query` (over name / effect / related bonds), and `modeType` 'SINGLE'|'MULTI'|null
 * (a strategy lists the mode types it is usable in, `modeTypeList` — 全部 includes a strategy with no list).
 * Sorted by `sortId` descending like the strategy draft (server/match/gamedata.js bandIds).
 */
export function filterBands(bands, { query = '', modeType = null, bondNamesOf = null } = {}) {
  return arr(bands).filter((b) => {
    if (!b) return false;
    if (modeType) {
      const modes = arr(b.modeTypeList);
      if (modes.length && !modes.includes(modeType)) return false;
    }
    return bandMatches(b, query, bondNamesOf ? bondNamesOf(b.bandId) : []);
  }).sort((a, b) => num(b.sortId) - num(a.sortId) || (s(a.bandId) < s(b.bandId) ? -1 : 1));
}

/** The codex view of one strategy. */
export function bandView(b) {
  return {
    band: b,
    bandId: s(b && b.bandId),
    name: s(b && b.name),
    effectName: s(b && b.effectName),
    effectId: s(b && b.effectId),
    effect: bandEffect(b),
    hp: num(b && b.totalHp),
    victorCount: Number.isFinite(Number(b && b.victorCount)) ? Number(b.victorCount) : null,
    rewardModulus: Number.isFinite(Number(b && b.rewardModulus)) ? Number(b.rewardModulus) : null,
    modes: arr(b && b.modeTypeList),
    unlock: s(b && b.unlockDesc),
    bondIds: bandBondIds(b),
    buffKeys: bandBuffKeys(b),
  };
}

// ---- 悬赏 / 敌人池 ----------------------------------------------------------------------------------

/** An enemy's display stats (enemies.json `stats`), all finite numbers. */
export function enemyStats(e) {
  const st = obj(e && e.stats) || {};
  return {
    maxHp: num(st.maxHp), atk: num(st.atk), def: num(st.def), res: num(st.res),
    moveSpeed: num(st.moveSpeed), bat: num(st.bat), aspd: num(st.aspd), lpr: num(st.lpr),
    rangeRadius: num(st.rangeRadius), blockCnt: num(st.blockCnt),
  };
}

/** The two leaders of the hunt, in phase order (shared/constants PHASE: FINAL_ASSAULT → HIDDEN_CORE). */
export const BOSS_PHASES = Object.freeze([
  { phase: 'FINAL_ASSAULT', weightsKey: 'bossWeights', hidden: false, roundKey: 'bossRound', micro: 'FINAL ASSAULT' },
  { phase: 'HIDDEN_CORE', weightsKey: 'hiddenBossWeights', hidden: true, roundKey: 'hiddenRound', micro: 'HIDDEN CORE' },
]);

/** Distinct escort rows of a boss, merged over every `escortsByTemplate` template: `{ key, count, slots }`. */
export function bossEscorts(b) {
  const by = new Map();
  for (const list of Object.values(obj(b && b.escortsByTemplate) || {})) {
    for (const e of arr(list)) {
      const key = s(e && e.key);
      if (!key) continue;
      const cur = by.get(key) || { key, count: 0, slots: new Set() };
      cur.count += num(e && e.count);
      if (s(e && e.slot)) cur.slots.add(s(e.slot));
      by.set(key, cur);
    }
  }
  return [...by.values()].map((x) => ({ key: x.key, count: x.count, slots: [...x.slots].sort() }))
    .sort((a, b2) => b2.count - a.count || (a.key < b2.key ? -1 : 1));
}

/** The wave template of a boss for a mode (bosses.json `templates[modeId]`), or null. */
export function bossTemplate(b, modeId) {
  const t = obj(b && b.templates) && obj(b.templates)[s(modeId)];
  return t ? { round: num(t.round), template: s(t.template) } : null;
}

/**
 * The two leader pools of a mode, from config.json `modes[modeId].bossWeights` / `.hiddenBossWeights` (the phase→pool
 * mapping, applied on bosses.json `hidden` by server/match/waves.js):
 *   [{ phase, hidden, micro, round, weightsKey, pool: [{ bossId, weight, boss, enemy, escorts }] }]
 * A pool with no weights (a mode without a hidden round) is an empty array — the caller shows 无数据.
 * @param {any} config data.get('config')
 * @param {any[]} bosses data.list('bosses')
 * @param {(key:string)=>any} [getEnemy] data lookup for enemies.json
 * @param {string} [modeId]
 */
export function bossPhasePools(config, bosses, getEnemy = () => null, modeId = 'mode_multi_hard') {
  const mode = obj(obj(config && config.modes) && obj(config.modes)[s(modeId)]) || null;
  const byId = new Map(arr(bosses).filter((b) => b && s(b.bossId)).map((b) => [b.bossId, b]));
  return BOSS_PHASES.map((ph) => {
    const weights = obj(mode && mode[ph.weightsKey]) || {};
    const pool = Object.entries(weights)
      .filter(([, w]) => num(w) > 0)
      .map(([bossId, weight]) => {
        const boss = byId.get(bossId);
        if (!boss) return null;
        return {
          bossId,
          weight: num(weight),
          boss,
          enemy: getEnemy(s(boss.enemyKey)),
          escorts: bossEscorts(boss).map((x) => ({ ...x, enemy: getEnemy(x.key) })),
          template: bossTemplate(boss, modeId),
        };
      })
      .filter(Boolean);
    return {
      phase: ph.phase, hidden: ph.hidden, micro: ph.micro, weightsKey: ph.weightsKey,
      round: mode ? num(mode[ph.roundKey]) : 0,
      modeId: s(modeId),
      modeName: s(mode && mode.name),
      pool,
    };
  });
}

/** The mode ids with a boss pool, in config order (for the 悬赏 tab's mode picker). */
export function bossPoolModes(config) {
  const modes = obj(config && config.modes) || {};
  return Object.entries(modes)
    .filter(([, m]) => obj(m && m.bossWeights) && Object.keys(m.bossWeights).length)
    .map(([id, m]) => ({ modeId: id, name: s(m && m.name), difficulty: s(m && m.difficulty) }));
}

/**
 * The 悬赏决策 card pools (choices.json `bountyDrafts`, the kind of each SP round: R3/R6 `initial`, R9 `boss`, R11
 * `hunter`) with the enemies they add — the card-based bounty mechanic, separate from the two leader phases.
 * @returns [{ kind, slots, pick, count, cards: {effectId,name,desc,tier,coin,payout,enemyKey,count,enemy}[], enemies: {key,enemy,count}[] }]
 */
export function bountyDraftPools(choices) {
  const body = obj(choices) || {};
  const cards = arr(obj(body.cards) && body.cards.bounty).filter((c) => c && s(c.effectId));
  const drafts = obj(body.bountyDrafts) || {};
  const poolCards = (kind) => cards.filter((c) => c.draft === true && (c.draftPool === kind || (!s(c.draftPool) && kind === 'initial')))
    .sort((a, b) => num(a.tier) - num(b.tier) || (s(a.effectId) < s(b.effectId) ? -1 : 1));
  const enemies = (list) => {
    const by = new Map();
    for (const c of list) if (s(c.enemyKey)) by.set(s(c.enemyKey), (by.get(s(c.enemyKey)) || 0) + Math.max(1, num(c.count)));
    return [...by.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => (a.key < b.key ? -1 : 1));
  };
  return ['initial', 'boss', 'hunter'].filter((k) => drafts[k]).map((kind) => {
    const spec = obj(drafts[kind]) || {};
    const list = poolCards(kind);
    return {
      kind,
      slots: Number(spec.slots) || 0,
      pick: s(spec.pick),
      count: Number(spec.count) || 0,
      groups: arr(spec.groups).length,
      cards: list.map((c) => ({
        effectId: s(c.effectId), name: s(c.name), desc: s(c.desc), tier: num(c.tier),
        coin: num(c.coin), payout: s(c.payout), rounds: num(c.rounds),
        enemyKey: s(c.enemyKey), count: num(c.count),
      })),
      enemies: enemies(list),
    };
  });
}
