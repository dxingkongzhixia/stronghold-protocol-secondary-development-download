// server/sim/content/bands/meta.js — prep side of the 40 strategies (bands, data/bands.json).
//
// Every band handler is assembled from the band's buffs by their official buff key (numbers from bb / bbStr, never
// hard-coded); keys that only act in battle (env_gbuff_new_with_verify, auto_chess_change_map) live in battle.js.
// Starting LP (totalHp) and 坎诺特's leftover funds are the match's own rules.
//
//   prep_finish_char_bond_add_layer {layer}            华法琳   prep end: per distinct board tier, 1 random op → its bonds +layer (无需激活)
//   band_first_self_refresh_present_char {count,bond}  杜遥夜   first 2 manual refreshes/round: ≥count <bond> chess (tier ≤ shop level)
//   band_shop_refresh_copy_max_lv_char {count}         梓兰     every manual refresh: highest-tier shop chess copied into another slot, copy frozen
//   preparation_start_gain_chess_from_round {round}    梓兰/小贾斯汀/昆图斯/马克维茨/变形者集群/Pith/夕/杰西卡/缪尔赛思/芬  prep start of `round`: bbStr.chess
//   preparation_start_gain_chess_every_n_round {round} 杜宾     prep start, every `round` rounds (round % n = 0): bbStr.chess
//   give_coin_in_round {round,coin}                    老鲤     income of round `round` = coin (R1/R2 0, R3 15)
//   prep_start_gain_chess_from_pool_in_round {round}   老鲤     prep start of `round`: 1 chess of pool
//   band_coin_cost_gain_random_char_by_shop_level      绮良     every coin_cnt funds spent → count random chess ≤ shop level
//   up_shop_next_refresh_must_present_bond_char        佩佩     level-up to a level of lvlist → the next manual refresh (its usual
//                                                               price) prefers <bond>
//   gain_bond_char_per_round {round,preround,bond}     哈洛德   rounds round, round+preround, …: a <bond> chess (≤ shop level, else any tier)
//   first_buy_in_round_char_price_change {price,bond}  休露丝   first <bond> chess of the round costs `price` (bought in the
//                                                               shop: onBuy — a free pick / grant never uses it up)
//   band_cost_coin_reach_cnt_gain_chess_from_pool      潘格尼尼 once coin_cnt funds spent in total: 1 chess of pool (elite 拉特兰 ≥ T4)
//   round_start_bond_check_gain_layer                  余       round start of `round`: exactly factioncount active bonds → +count1, else each active +count2
//                                                               — never to a bond without layers (noStack; the owner's decision of 2026-10-08)
//   up_shop_add_special_goods {count,choice,pool}      凯瑟琳   every level-up: pick 1 of `count` items of pool (free)
//   coin_carry_over {capital,interest,max}             坎诺特   leftover ≥ capital at round start → +min(max, ⌊left/capital⌋×interest) income
//   round_start_all_player_change_enemy_2              鸭爵     global: every alive player's battle from `round` (own + teammates;
//                                                                normal, Final Assault, Hidden Core — on the player's half of a
//                                                                pair field): 0–2 ground enemies → enemylist
//   round_start_activate_char_chess_effect_in_board    铃兰     round start: 获得时 traits of the right-most (then bottom-most) board op with one
//   first_sell_char_chess_exchange_char_chess_in_shop  巫恋     first sale of a normal op per round: swapped with a random shop chess (no funds)
//   round_start_gain_char_chess_in_shop_every_n_round  松桐     prep start, round % n = 0: a random shop chess for free (its slot empties)
//   round_start_gain_coin_by_bond_char_chess_buy       玛恩纳   each <bond> chess bought → +count funds next round (≤ max_count / round)
//   refresh_shop_count_gain_coin_bond_char_chess       贾维     every refresh_count manual refreshes (match total) → <bond> chess ≤ shop level (≤ max_count / round)
//   preparation_start_add_special_goods_every_n_round  娜仁图亚 prep start, round % n = 0: pick choice_cnt of refresh_cnt items of pool (free)
// "进入休整期时" / "休整期开始时" = onPrepStart: after the round's 机变 phase (research 01 §4.1: the 机变 choice is step 4, the
// 「进入休整期时」 effects step 6; official 「进入此阶段时，触发<进入休整期时>的效果」 of the 休整期). The five keys above whose text or key
// says so (老鲤 「第3回合进入休整期时」, 松桐 「偶数回合的休整期开始时」, 娜仁图亚 / 小贾斯汀 / 杰西卡 「进入休整期时」, the
// preparation_start_* keys of the rest) run there — GitHub #851: 老鲤's R3 operators showed before the R3 draft. The whole key
// moves, so 缪尔赛思's 「在第1回合开始时」 and the texts with no time (「第3回合获得」, 「每5回合获得」) follow their key [ASSUMED]. A
// 机变 round (config spRounds) meets 老鲤 / 昆图斯 at R3 and the even-round ones (杜宾, 松桐, 娜仁图亚) at R6 of NORMAL; elsewhere
// only the order around the round start changes. "回合开始时" (余, 铃兰) and 哈洛德's gain_bond_char_per_round stay onRoundStart.

import { GEO } from '../../../../shared/constants.js';
import { bbCap } from '../../../../shared/plugins/officialBounds.js';
import { bandSkillStages, activeBandSkillIndex } from '../../../../shared/bandSkill.js';
import { createRng } from '../../rng.js';
import { buffsOf, num, bandRecord, effectRecord, gameData } from '../support/index.js';
import { metaBonds } from '../support/meta.js';
import * as garrisons from '../garrisons.js';

const int = (v, d = 0) => Math.trunc(num(v, d));
// [ASSUMED] DESIGN §32.5: bb.count grant and slot loops share the official `count` cap. Read at call time.
const timesOf = (v, d = 1) => Math.min(bbCap('count'), Math.max(1, int(v, d)));
const list = (s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const hasBond = (ctx, id, bond) => { const c = ctx.gd.chess(id); return !!(c && Array.isArray(c.bonds) && c.bonds.includes(bond)); };
const isNormalChess = (ctx, id) => { const c = ctx.gd.chess(id); return !!(c && !c.isGolden); };

/** Per-round counter: reset lazily when the round changes. */
function roundCounter(ctx, key) {
  if (ctx.counter(`${key}:r`) !== ctx.round) { ctx.setCounter(`${key}:r`, ctx.round); ctx.setCounter(key, 0); }
  return ctx.counter(key);
}
const bumpRound = (ctx, key, n = 1) => { roundCounter(ctx, key); return ctx.incCounter(key, n); };

/** Grant a chess or an item by id. */
function grant(ctx, id, opts = {}) {
  if (ctx.gd.item(id)) return ctx.grantItem(id, opts);
  if (ctx.gd.chess(id)) return ctx.grantChess(id, opts);
  return null;
}

/** Indices of unsold chess slots of the shop. */
const chessSlots = (ctx) => ctx.shopSlots().map((s, i) => (s && s.kind === 'chess' && !s.sold ? i : -1)).filter((i) => i >= 0);

/** Up to `n` distinct item ids of an equip pool. */
function rollItems(ctx, poolId, n, exclude = []) {
  const out = [];
  if (exclude.length) {
    // [ASSUMED] After Cathy's allowance is used, sample eligible items without replacement, up to count (official
    // aceffect_band_26). Filter before drawing so forbidden/repeated ids cannot underfill a fresh offer.
    for (let k = 0; k < n; k++) {
      const r = ctx.rollPool(poolId, { exclude: [...exclude, ...out] });
      if (!r || r.kind !== 'item') break;
      out.push(r.id);
    }
    return out;
  }
  for (let k = 0; k < n * 6 && out.length < n; k++) {
    const r = ctx.rollPool(poolId);
    if (!r || r.kind !== 'item') break;
    if (!out.includes(r.id)) out.push(r.id);
  }
  return out;
}

/** Random chess of `bond`, tier ≤ shop level (fallback: any tier when `anyTier`). */
function rollBond(ctx, bond, { anyTier = false } = {}) {
  return ctx.rollChess({ bond, maxTier: Math.max(1, ctx.shopLevel()) }) || (anyTier ? ctx.rollChess({ bond, maxTier: 6 }) : null);
}

// ---------------------------------------------------------------------------------------------------------------
// buff key → (params[], bandId) → hooks

const K = {};

K.prep_finish_char_bond_add_layer = (ps) => ({
  onPrepEnd(ctx) {
    const n = int(ps[0].layer, 0);
    if (n <= 0) return;
    const byTier = new Map();
    for (const p of ctx.board()) {
      if (!p || p.kind !== 'chess') continue;
      const t = p.tier ?? ctx.gd.tierOf(p.id);
      if (!byTier.has(t)) byTier.set(t, []);
      byTier.get(t).push(p);
    }
    for (const t of [...byTier.keys()].sort((a, b) => a - b)) {
      const p = ctx.rng.pick(byTier.get(t));
      for (const b of metaBonds(ctx, p)) ctx.addLayers(b, n, { requireActive: false, reason: 'band' });
    }
  },
});

K.band_first_self_refresh_present_char = (ps) => ({
  onRefresh(ctx) {
    const p = ps[0];
    if ((ctx.roundStats().refreshes || 0) > 2) return;
    const need = timesOf(p.count, 1);
    const idx = chessSlots(ctx);
    const slots = ctx.shopSlots();
    let have = idx.filter((i) => hasBond(ctx, slots[i].id, p.bond)).length;
    const others = ctx.rng.shuffle(idx.filter((i) => !hasBond(ctx, slots[i].id, p.bond)));
    for (const i of others) {
      if (have >= need) break;
      const id = rollBond(ctx, p.bond);
      if (!id) break;
      ctx.setShopSlot(i, { kind: 'chess', id });
      have++;
    }
  },
});

K.band_shop_refresh_copy_max_lv_char = () => ({
  onRefresh(ctx) {
    const slots = ctx.shopSlots();
    const idx = chessSlots(ctx);
    if (idx.length < 2) return;
    let best = -1;
    for (const i of idx) best = Math.max(best, ctx.gd.tierOf(slots[i].id));
    const src = ctx.rng.pick(idx.filter((i) => ctx.gd.tierOf(slots[i].id) === best));
    const dst = ctx.rng.pick(idx.filter((i) => i !== src));
    ctx.setShopSlot(dst, { kind: 'chess', id: slots[src].id, frozen: true });
  },
});

K.preparation_start_gain_chess_from_round = (ps) => ({
  onPrepStart(ctx) {
    for (const p of ps) {
      const id = p.chess ?? p.chess_id;
      if (ctx.round !== int(p.round, -1) || !id) continue;
      for (let k = 0; k < timesOf(p.count, 1); k++) grant(ctx, id, { requirePool: false, source: 'band' });
    }
  },
});

K.preparation_start_gain_chess_every_n_round = (ps) => ({
  onPrepStart(ctx) {
    for (const p of ps) {
      const n = int(p.round, 0);
      const id = p.chess ?? p.chess_id;
      if (n <= 0 || ctx.round % n !== 0 || !id) continue;
      for (let k = 0; k < timesOf(p.count, 1); k++) grant(ctx, id, { source: 'band' });
    }
  },
});

K.give_coin_in_round = (ps) => ({
  onIncome(ctx, ev) {
    for (const p of ps) if (ctx.round === int(p.round, -1)) ev.income = Math.max(0, int(p.coin, 0));
  },
});

K.prep_start_gain_chess_from_pool_in_round = (ps) => ({
  onPrepStart(ctx) {
    for (const p of ps) {
      if (ctx.round !== int(p.round, -1)) continue;
      for (let k = 0; k < timesOf(p.count, 1); k++) {
        const r = ctx.rollPool(p.pool);
        if (r) grant(ctx, r.id, { source: 'band' });
      }
    }
  },
});

K.band_coin_cost_gain_random_char_by_shop_level = (ps) => ({
  onSpend(ctx, ev) {
    const p = ps[0];
    const step = int(p.coin_cnt, 0);
    if (step <= 0 || !(ev.amount > 0)) return;
    let acc = ctx.incCounter('band:kirara:acc', ev.amount);
    while (acc >= step) {
      acc = ctx.incCounter('band:kirara:acc', -step);
      for (let k = 0; k < timesOf(p.count, 1); k++) {
        const id = ctx.rollChess({ maxTier: Math.max(1, ctx.shopLevel()) });
        if (id) ctx.grantChess(id, { source: 'band' });
      }
    }
  },
});

// 佩佩 博学多通 "升级调度中心至2、4和6级后，获得1次特殊刷新：此次刷新出现的干员优先为<萨尔贡>干员": the special refresh is the
// player's next manual refresh, paid as usual — the text gives no 免费 (德克萨斯's trait says 「获得1次免费刷新」 for a free
// one), and the community report of 2026-10-06 「佩佩策略的特殊刷新也是要花钱的，不是免费」. Until 0.2.0 a free refresh came
// with it (blackboard `price` 0 read as its price) [ASSUMED: `cnt` / `price` 0 change nothing].
K.up_shop_next_refresh_must_present_bond_char = (ps) => ({
  onLevelUp(ctx, ev) {
    const p = ps[0];
    if (!list(p.lvlist).map(Number).includes(ev.level)) return;
    ctx.incCounter('band:pepe:special', 1);
  },
  onRefresh(ctx) {
    if (ctx.counter('band:pepe:special') <= 0) return;
    ctx.incCounter('band:pepe:special', -1);
    const bond = ps[0].bond;
    const slots = ctx.shopSlots();
    for (const i of chessSlots(ctx)) {
      if (hasBond(ctx, slots[i].id, bond)) continue;
      const id = rollBond(ctx, bond);
      if (!id) break;
      ctx.setShopSlot(i, { kind: 'chess', id });
    }
  },
});

K.gain_bond_char_per_round = (ps) => ({
  onRoundStart(ctx) {
    const p = ps[0];
    const r0 = int(p.round, 1), every = Math.max(1, int(p.preround, 1));
    if (ctx.round < r0 || (ctx.round - r0) % every !== 0) return;
    for (let k = 0; k < timesOf(p.count, 1); k++) {
      const id = rollBond(ctx, p.bond, { anyTier: true });
      if (id) ctx.grantChess(id, { source: 'band' });
    }
  },
});

K.first_buy_in_round_char_price_change = (ps) => ({
  onPrice(ctx, ev) {
    const p = ps[0];
    if (ev.kind !== 'chess' || !hasBond(ctx, ev.id, p.bond)) return;
    if (ctx.counter('band:sciurus:r') === ctx.round) return;
    ctx.setPrice(Math.min(num(ev.price, 0), int(p.price, 1)));
  },
  onBuy(ctx, ev) {
    if (ev.kind === 'chess' && hasBond(ctx, ev.slot.id, ps[0].bond)) ctx.setCounter('band:sciurus:r', ctx.round);
  },
});

K.band_cost_coin_reach_cnt_gain_chess_from_pool = (ps) => ({
  onSpend(ctx, ev) {
    const p = ps[0];
    if (ctx.counter('band:paganini:done') > 0) return;
    const spent = ctx.incCounter('band:paganini:spent', Math.max(0, int(ev.amount, 0)));
    if (spent < int(p.coin_cnt, 0)) return;
    const r = ctx.rollPool(p.pool);
    if (r && grant(ctx, r.id, { source: 'band' })) ctx.setCounter('band:paganini:done', 1);
  },
});

/**
 * 余 【文火慢炖】 「第8回合开始时，若仅激活了1个盟约，使其增加36层；否则使所有已激活盟约增加12层」. The owner's decision of 2026-10-08
 * overrides PRTS here (下半/PRTS盟约记录: layers of a bond that shows none 「仍然对其生效」): a bond without layers — bonds.json
 * `noStack`: 绝技, 独行, 调和, 协防干员 — gets none. The count stays the sentence's (every active bond), so one active bond
 * that is such a bond means nothing is added, and with two active bonds a layered one still gets count2. Only this
 * strategy: 协防's 「使所有已激活的盟约层数」 (bonds/addon/meta.js) and 华法琳's 【重点监护】 keep adding to every bond they name.
 */
K.round_start_bond_check_gain_layer = (ps) => ({
  onRoundStart(ctx) {
    const p = ps[0];
    if (ctx.round !== int(p.round, -1)) return;
    const active = Object.entries(ctx.bonds()).filter(([, b]) => b && b.active).map(([id]) => id);
    const n = active.length === int(p.factioncount, 1) ? int(p.count1, 0) : int(p.count2, 0);
    for (const b of active) {
      if (ctx.gd.bond(b)?.noStack) continue;
      ctx.addLayers(b, n, { requireActive: true, reason: 'band' });
    }
  },
});

// Official activity_table aceffect_band_26: count 3, choice 1, pool_equip_kathe; no cell limit is exposed.
// #677: maintainer decision 2026-10-17 (official play memory): Cathy gives the cell at most once per player/match.
// [ASSUMED] "given" means successfully taken, not shown; Quintus's independent grant does not use this allowance.
K.up_shop_add_special_goods = (ps, bandId) => ({
  onLevelUp(ctx) {
    const p = ps[0];
    // effectRef would inherit the behaviour upstream; this fork has no effectRef data, so the id is compared directly.
    const cathy = bandId === 'band_cathy'; // our data has no effectRef (0/40 bands), so no inherited id to resolve
    const exclude = cathy && ctx.counter('band:cathy:cellTaken') ? ['chess_item_5_08_e_a'] : [];
    const ids = rollItems(ctx, p.pool, timesOf(p.count, 3), exclude);
    if (ids.length) ctx.offerItems(ids, { source: cathy ? 'band:band_cathy' : 'band' });
  },
});

K.coin_carry_over = (ps) => ({
  onIncome(ctx, ev) {
    const p = ps[0];
    const cap = int(p.capital, 0), left = ctx.funds();
    if (cap <= 0 || left < cap) return;
    const bonus = Math.min(int(p.max, Infinity), Math.floor(left / cap) * int(p.interest, 0));
    if (bonus > 0) ev.income = int(ev.income, 0) + bonus;
  },
});

K.round_start_activate_char_chess_effect_in_board = (ps) => ({
  onRoundStart(ctx) {
    const p = ps[0];
    const event = p.event_type || 'SERVER_GAIN';
    const cands = ctx.board().filter((v) => v && v.kind === 'chess' && ctx.garrisonsOf(v.uid).some((g) => g.eventType === event));
    if (!cands.length) return;
    cands.sort((a, b) => (b.col - a.col) || (a.row - b.row));
    for (const v of cands.slice(0, timesOf(p.count, 1))) {
      if (event === 'SERVER_GAIN' && typeof garrisons.triggerGainEffects === 'function') garrisons.triggerGainEffects(ctx, v);
      else ctx.triggerGarrisons(v.uid, event);
    }
  },
});

K.first_sell_char_chess_exchange_char_chess_in_shop = (ps) => ({
  onSold(ctx, ev) {
    const piece = ev.piece;
    if (!piece || piece.kind !== 'chess' || !isNormalChess(ctx, piece.id)) return;
    if (roundCounter(ctx, 'band:vodfox') >= Math.max(1, int(ps[0].count, 1))) return;
    const slots = ctx.shopSlots();
    const idx = chessSlots(ctx);
    if (!idx.length) return;
    const i = ctx.rng.pick(idx);
    const got = ctx.grantChess(slots[i].id, { source: 'band' });
    if (!got) return;
    ctx.setShopSlot(i, { kind: 'chess', id: piece.id });
    ev.gain = 0;
    bumpRound(ctx, 'band:vodfox');
  },
});

K.round_start_gain_char_chess_in_shop_every_n_round = (ps) => ({
  onPrepStart(ctx) {
    const p = ps[0];
    const n = int(p.round, 0);
    if (n <= 0 || ctx.round % n !== 0) return;
    for (let k = 0; k < timesOf(p.count, 1); k++) {
      const idx = chessSlots(ctx);
      if (!idx.length) return;
      const i = ctx.rng.pick(idx);
      if (ctx.grantChess(ctx.shopSlots()[i].id, { source: 'band' })) ctx.setShopSlot(i, null);
    }
  },
});

K.round_start_gain_coin_by_bond_char_chess_buy = (ps) => ({
  onBuy(ctx, ev) {
    const p = ps[0];
    if (ev.kind !== 'chess' || !hasBond(ctx, ev.slot.id, p.bond)) return;
    const n = int(p.count, 1), max = int(p.max_count, Infinity);
    const used = roundCounter(ctx, 'band:mlynar');
    const add = Math.min(n, max - used);
    if (add <= 0) return;
    ctx.addPendingFunds(add);
    bumpRound(ctx, 'band:mlynar', add);
  },
});

K.refresh_shop_count_gain_coin_bond_char_chess = (ps) => ({
  onRefresh(ctx) {
    const p = ps[0];
    const every = int(p.refresh_count, 0);
    if (every <= 0) return;
    if (ctx.incCounter('band:chiave:refreshes', 1) % every !== 0) return;
    if (roundCounter(ctx, 'band:chiave') >= int(p.max_count, Infinity)) return;
    const id = rollBond(ctx, p.bond);
    if (id && ctx.grantChess(id, { source: 'band' })) bumpRound(ctx, 'band:chiave');
  },
});

// ---- act3 bands (official skill/effect metadata in data/versions/<slug>/bands.json) -----------------------------

/** 全力熔铸: on the listed rounds' prep start, one random item of the shop level. */
K.prep_start_random_equip_in_round = (ps) => ({
  onPrepStart(ctx) {
    for (const p of ps) {
      if (ctx.round !== int(p.round, -1)) continue;
      const id = ctx.rollItem({ maxTier: Math.max(1, ctx.shopLevel()) });
      if (id) ctx.grantItem(id, { source: 'band' });
    }
  },
});

/** 雪域礼赠: the first purchase of the named bond's chess each round costs `price`. */
K.round_buy_bond_char_price = (ps) => ({
  onPrice(ctx, ev) {
    const p = ps[0] || {};
    if (!ev || ev.kind !== 'chess' || !hasBond(ctx, ev.id, p.bond)) return;
    if (roundCounter(ctx, 'band:kjerag') > 0) return;
    ctx.setPrice(Math.min(num(ev.price, 0), int(p.price, 1)));
  },
  onBuy(ctx, ev) {
    if (ev && ev.kind === 'chess' && hasBond(ctx, ev.slot.id, ps[0].bond)) bumpRound(ctx, 'band:kjerag');
  },
});

/** 量体裁衣: after the first `refresh_count` refreshes of a round, `coin` funds (once). */
K.n_round_refresh_cnt_gain_coin = (ps) => ({
  onRefresh(ctx) {
    const p = ps[0];
    const need = Math.max(1, int(p.refresh_count, 1));
    if (bumpRound(ctx, 'band:siracusa') !== need) return;
    ctx.addFunds(int(p.coin, 1), 'band');
  },
});

/** 自发制造: every `count` purchases of the named bond's chess, one random item. */
K.buy_bond_char_cnt_gain_equip = (ps) => ({
  onBuy(ctx, ev) {
    const p = ps[0];
    if (!ev || ev.kind !== 'chess' || !hasBond(ctx, ev.slot.id, p.bond)) return;
    const need = Math.max(1, int(p.count, 1));
    if (ctx.incCounter('band:victoria:buys', 1) % need !== 0) return;
    const id = ctx.rollItem({ maxTier: Math.max(1, ctx.shopLevel()) });
    if (id) ctx.grantItem(id, { source: 'band' });
  },
});

/** 替身娃娃: the first normal operator sold in a round is exchanged for a random shop-level operator (no funds). */
K.sell_char_swap_shop_char = (_ps) => ({
  onSold(ctx, ev) {
    if (!ev || !ev.piece || ev.piece.kind !== 'chess') return;
    if (!isNormalChess(ctx, ev.piece.id) || roundCounter(ctx, 'band:substitute') > 0) return;
    const id = ctx.rollChess({ maxTier: Math.max(1, ctx.shopLevel()) });
    if (!id || !ctx.grantChess(id, { source: 'band' })) return;
    ev.gain = 0;
    bumpRound(ctx, 'band:substitute');
  },
});

// ---- act3 active band skills (g.bandSkill → onBandSkill / onBandSkillPrice) ------------------------------------
// The skill's availability, target type and base cost are the band record's official `skill` metadata (the intent
// checks them); a handler that acted sets `ev.done`, and the one COOLDOWN skill names its cooldown in rounds
// (`ev.cooldown`). `onBandSkillPrice` moves the price only (it must have no side effects).

/** 内部货源: the next `times` equipment purchases cost `count` less (never below 0). */
K.skill_next_equip_buy_discount = (ps) => ({
  onBandSkill(ctx, ev) {
    ctx.incCounter('band:price:discounts', timesOf(ps[0].times, 1));
    ev.done = true;
  },
  onPrice(ctx, ev) {
    if (ev.kind !== 'item' || ctx.counter('band:price:discounts') <= 0) return;
    ctx.modifyPrice(-Math.max(1, int(ps[0].count, 1)));
  },
  // the discount is used up by a purchase, not by a price the screen only showed (priceOf dispatches onPrice too)
  onBuy(ctx, ev) {
    if (ev.kind === 'item' && ctx.counter('band:price:discounts') > 0) ctx.incCounter('band:price:discounts', -1);
  },
});

/** 私募基金: `mingold`..`maxgold` funds at random; the cooldown is the amount gained. */
K.skill_gain_gold_cd_by_gold = (ps) => ({
  onBandSkill(ctx, ev) {
    const lo = Math.max(0, int(ps[0].mingold, 1));
    const hi = Math.max(lo, int(ps[0].maxgold, 6));
    const n = lo + ctx.rng.int(hi - lo + 1);
    if (n > 0) ctx.addFunds(n, 'band');
    ev.cooldown = Math.max(1, n);
    ev.done = true;
  },
});

/** 人才锁定: refresh, then `count` chess slots hold an operator one tier above the shop level (capped at the max level). */
K.skill_refresh_shop_high_tier = (ps) => ({
  onBandSkill(ctx, ev) {
    if (!ctx.refreshShop()) return;
    const slots = chessSlots(ctx);
    if (!slots.length) { ev.done = true; return; }
    const tier = Math.min(ctx.gd.maxShopLevel, Math.max(1, ctx.shopLevel()) + Math.max(1, int(ps[0].lv_up, 1)));
    for (const i of ctx.rng.shuffle(slots.slice()).slice(0, timesOf(ps[0].count, 1))) {
      const id = ctx.rollChess({ tier }) || ctx.rollChess({ maxTier: tier });
      if (id) ctx.setShopSlot(i, { kind: 'chess', id });
    }
    ev.done = true;
  },
});

/** 专享情报: refresh, then a slot holds a copy of one of the player's own deployed operators. */
K.skill_refresh_shop_board_char = (_ps) => ({
  onBandSkill(ctx, ev) {
    if (!ctx.refreshShop()) return;
    const slots = chessSlots(ctx);
    const board = [...new Set(ctx.board().filter((v) => v && v.kind === 'chess').map((v) => ctx.gd.baseIdOf(v.id)))];
    if (slots.length && board.length) ctx.setShopSlot(ctx.rng.pick(slots), { kind: 'chess', id: ctx.rng.pick(board) });
    ev.done = true;
  },
});

/** 广交豪杰: refresh, then `count` chess slots hold a `bond` operator (tier ≤ shop level). */
K.skill_refresh_shop_bond_char = (ps) => ({
  onBandSkill(ctx, ev) {
    const bond = ps[0].bond;
    if (!ctx.refreshShop()) return;
    let slots = chessSlots(ctx);
    for (let k = 0; k < timesOf(ps[0].count, 1) && slots.length; k++) {
      const id = rollBond(ctx, bond);
      if (!id) break;
      const free = slots.filter((i) => !hasBond(ctx, ctx.shopSlots()[i].id, bond));
      const i = ctx.rng.pick(free.length ? free : slots);
      ctx.setShopSlot(i, { kind: 'chess', id });
      slots = slots.filter((x) => x !== i);
    }
    ev.done = true;
  },
});

/** 骑士团长 / 流动乐章 / 无惧风雪: `count` `bond` operators (tier ≤ shop level). */
K.skill_gain_bond_char = (ps) => ({
  onBandSkill(ctx, ev) {
    for (let k = 0; k < timesOf(ps[0].count, 1); k++) {
      const id = rollBond(ctx, ps[0].bond);
      if (id && ctx.grantChess(id, { source: 'band' })) ev.done = true;
    }
  },
});

/** 打包速递: every operator the shop is showing, for free (its slot empties). */
K.skill_gain_all_shop_char = (_ps) => ({
  onBandSkill(ctx, ev) {
    for (const i of chessSlots(ctx)) {
      if (!ctx.grantChess(ctx.shopSlots()[i].id, { source: 'band' })) continue;
      ctx.setShopSlot(i, null);
      ev.done = true;
    }
  },
});

/** 精巧设计: one new equipment replaces a random item slot of the shop. */
K.skill_change_shop_equip = (_ps) => ({
  onBandSkill(ctx, ev) {
    const items = ctx.shopSlots().map((s, i) => (s && s.kind === 'item' && !s.sold ? i : -1)).filter((i) => i >= 0);
    if (!items.length) return;
    const id = ctx.rollItem({ maxTier: Math.max(1, ctx.shopLevel()) });
    if (!id) return;
    ctx.setShopSlot(ctx.rng.pick(items), { kind: 'item', id });
    ev.done = true;
  },
});

/** 打包速递 / 骑士团长: the cost falls by `delta` at every prep end and is reset by a use ("使用后指令重置"). */
K.skill_cost_round_grow_reset_on_use = (ps, bandId) => {
  const key = `band:${bandId}:cost`;
  return {
    onBandSkillPrice(ctx, ev) { ev.cost = Math.max(0, int(ev.cost, 0) + ctx.counter(key)); },
    onPrepEnd(ctx) { ctx.incCounter(key, -Math.max(1, int(ps[0].delta, 1))); },
    onBandSkillUsed(ctx) { ctx.setCounter(key, 0); },
  };
};

/** 流动乐章: the cost rises by `count` for good after every use. */
K.skill_cost_grow_per_use = (ps, bandId) => {
  const key = `band:${bandId}:cost`;
  return {
    onBandSkillPrice(ctx, ev) { ev.cost = Math.max(0, int(ev.cost, 0) + ctx.counter(key)); },
    onBandSkillUsed(ctx) { ctx.incCounter(key, Math.max(1, int(ps[0].count, 1))); },
  };
};

/** 无惧风雪: every `bond` purchase lowers the cost by `count`, until a use resets it. */
K.skill_cost_reduce_on_buy_bond = (ps, bandId) => {
  const key = `band:${bandId}:cost`;
  return {
    onBandSkillPrice(ctx, ev) { ev.cost = Math.max(0, int(ev.cost, 0) - ctx.counter(key)); },
    onBuy(ctx, ev) {
      if (ev.kind === 'chess' && hasBond(ctx, ev.slot.id, ps[0].bond)) {
        ctx.incCounter(key, Math.max(1, int(ps[0].count, 1)));
      }
    },
    onBandSkillUsed(ctx) { ctx.setCounter(key, 0); },
  };
};

/** 追随者们: each prep, offer `choice_event`'s count (skill_change_2 → 2) of random active instructions to swap in. */
K.gain_band_skill_from_pool_in_prep = (ps) => {
  const n = Math.max(1, Number((String(ps[0]?.choice_event || '').match(/(\d+)$/) || [])[1]) || 2);
  return {
    onPrepStart(ctx) { ctx.offerBandInstructions(n); },
  };
};

// ---- act3 active band skills on an operator (B3) --------------------------------------------------------------

/** 至纯凝结: the target becomes elite at once (a promotion; ALL_LIMIT x1). */
K.skill_upgrade_char = (_ps) => ({
  onBandSkill(ctx, ev) {
    if (ctx.promote(ev.target.uid)) ev.done = true;
  },
});

/** 幻画为真: a copy of the target, its elite state and its equipment included. */
K.skill_copy_char_with_equip = (_ps) => ({
  onBandSkill(ctx, ev) {
    const p = ctx.piece(ev.target.uid);
    if (!p) return;
    const copy = ctx.grantChess(p.id, { source: 'band' });
    if (!copy) return;
    ev.done = true;
    // the equipment comes along one piece at a time (each grant can merge with a copy already in the hand)
    for (const it of p.items || []) {
      const item = ctx.grantItem(it.id, { source: 'band' });
      if (item && copy.uid != null) ctx.equipDirect(item.uid, copy.uid);
    }
  },
});

/** 御守之力: run the target's `event` traits now (`count` times). */
K.skill_trigger_garr_event = (ps) => ({
  onBandSkill(ctx, ev) {
    const p = ps[0] || {};
    const event = p.event || 'SERVER_GAIN';
    let runs = 0;
    for (let k = 0; k < timesOf(p.count, 1); k++) runs += ctx.triggerGarrisons(ev.target.uid, event);
    if (runs > 0) ev.done = true;
  },
});

/** 强制休整: the target's `event` traits run `count` more times at this prep's end. */
K.skill_garr_event_extra_exec = (ps) => ({
  onBandSkill(ctx, ev) {
    const p = ps[0] || {};
    const event = p.event || 'SERVER_PREP_FIN';
    const uid = ev.target.uid;
    // no such trait: nothing to run twice, so the use is refused (not charged)
    if (!ctx.garrisonsOf(uid).some((g) => g.eventType === event)) return;
    ctx.incPieceCounter(uid, 'band:prepfin', timesOf(p.count, 1));
    ev.done = true;
  },
  onPrepEnd(ctx) {
    const event = (ps[0] && ps[0].event) || 'SERVER_PREP_FIN';
    for (const v of [...ctx.board(), ...ctx.hand(), ...ctx.temp()]) {
      if (!v || v.kind !== 'chess') continue;
      const n = ctx.pieceCounter(v.uid, 'band:prepfin');
      if (n <= 0) continue;
      for (let k = 0; k < n; k++) ctx.triggerGarrisons(v.uid, event);
      ctx.incPieceCounter(v.uid, 'band:prepfin', -n);
    }
  },
});

/** 东之极道: sell the target; every active bond gains layers equal to the operator's tier. */
K.skill_sell_char_bond_layer = (_ps) => ({
  onBandSkill(ctx, ev) {
    const p = ctx.piece(ev.target.uid);
    if (!p) return;
    const n = Math.max(1, p.tier || 1);
    if (!ctx.sell(ev.target.uid)) return;
    for (const b of Object.keys(ctx.bonds())) {
      if (!ctx.bondActive(b)) continue;
      ctx.addLayers(b, n, { requireActive: true, reason: 'band' });
    }
    ev.done = true;
  },
});

/** 黑白相易 / 出航时刻: remove the target (or replace a shop card, `in_shop`), then gain a `bond` operator of no higher tier. */
K.skill_remove_gain_bond_char = (ps) => ({
  onBandSkill(ctx, ev) {
    const p = ps[0] || {};
    if (int(p.in_shop, 0) === 1) {
      // 出航时刻 (伊比利亚): the target is a card of the shop, replaced by a 伊比利亚 operator of no higher tier
      const slot = ev.target && Number.isInteger(ev.target.slot) ? ctx.shopSlots()[ev.target.slot] : null;
      if (!slot || slot.kind !== 'chess' || slot.sold) return;
      const id = ctx.rollChess({ bond: p.bond, maxTier: Math.max(1, ctx.gd.tierOf(slot.id)) });
      if (!id) return;
      ctx.setShopSlot(ev.target.slot, { kind: 'chess', id });
      ev.done = true;
      return;
    }
    const target = ctx.piece(ev.target.uid);
    if (!target) return;
    const maxTier = Math.max(1, target.tier || 1);
    // draw before the removal: an empty pool must not cost the operator
    const id = ctx.rollChess({ bond: p.bond, maxTier });
    if (!id || !ctx.destroyPiece(ev.target.uid)) return;
    for (let k = 0; k < timesOf(p.count, 1); k++) {
      if (ctx.grantChess(id, { source: 'band' })) ev.done = true;
    }
  },
});

/**
 * The battle mark of an official inst tag (`skill_mark_char_inst_tag`'s `tag`): the tag's own effect record names the
 * battle buff (activation_table effectBuffInfoDataDict), e.g. eff_band12 → act3autochess_band12_buff (revives),
 * eff_band17/18 → act1autochess_band17_buff (shield on attack, 20 % → 35 %), eff_band22 → knockdown + summon.
 * [ASSUMED] `start_dead` = the operator is knocked down and revived at battle start.
 */
function instTagMark(ctx, tag) {
  const rec = ctx.gd.effect(tag);
  for (const b of (rec && rec.buffs) || []) {
    if (b.key === 'auto_chess_battle_chess_upgrade') return { tag: 'battle_upgrade' };
    if (b.key !== 'env_gbuff_new_with_verify') continue;
    const key = b.bbStr && b.bbStr.key;
    const bb = b.bb || {};
    if (key === 'act3autochess_band12_buff') {
      return { tag: 'revive', count: Math.max(1, int(bb.max_respawn_cnt, 2)), startDead: int(bb.start_dead, 0) === 1 };
    }
    if (key === 'act1autochess_band17_buff') return { tag: 'shield_on_attack', prob: num(bb.prob, 0.2), cap: 1 };
    if (key === 'act3autochess_band22_buff') return { tag: 'knockdown_summon' };
  }
  return null;
}

/** 意志鼓舞 / 全场聚焦 / 药枚实验 / 消解空间: mark the target for its next battle (see instTagMark). */
K.skill_mark_char_inst_tag = (ps) => ({
  onBandSkill(ctx, ev) {
    const tag = ps[0] && ps[0].tag;
    const mark = tag ? instTagMark(ctx, tag) : null;
    if (mark && ctx.addBandMark(ev.target.uid, mark)) ev.done = true;
  },
});

/** 正直教官: the target's 卫戍能力 layer cap next battle rises by the round (`layer_cap` mark). */
K.skill_layer_limit_grow_round = (_ps) => ({
  onBandSkill(ctx, ev) {
    const n = Math.max(1, Math.round(Number(ctx.round) || 0));
    if (ctx.addBandMark(ev.target.uid, { tag: 'layer_cap', bonus: n })) ev.done = true;
  },
});

// ---- act3 active band skills on a tile / a shop card (B4) ------------------------------------------------------

/** 纸片替身: a card of the shop becomes another operator of its tier. */
K.skill_transform_char_same_tier = (_ps) => ({
  onBandSkill(ctx, ev) {
    const i = ev.target && Number.isInteger(ev.target.slot) ? ev.target.slot : -1;
    const slot = i >= 0 ? ctx.shopSlots()[i] : null;
    if (!slot || slot.kind !== 'chess' || slot.sold) return;
    const tier = Math.max(1, ctx.gd.tierOf(slot.id));
    // another operator when the pool has one (a redraw of the same card would be no change at all)
    let id = null;
    for (let k = 0; k < 6; k++) {
      const r = ctx.rollChess({ tier });
      if (!r) continue;
      id = r;
      if (r !== slot.id) break;
    }
    if (!id) return;
    ctx.setShopSlot(i, { kind: 'chess', id });
    ev.done = true;
  },
});

/** 溃心领域: the first enemy to pass the chosen tile after the battle starts is feared for `fear` seconds. */
K.skill_mark_pos_grow_use_cnt = (ps) => ({
  onBandSkill(ctx, ev) {
    const t = ev.target;
    if (!t || !Number.isInteger(t.row) || !Number.isInteger(t.col)) return;
    const tag = ps[0] && ps[0].tag;
    const rec = tag ? ctx.gd.effect(tag) : null;
    const b = ((rec && rec.buffs) || []).find((x) => x.key === 'env_gbuff_new_with_verify');
    const fear = Math.max(0.1, num(b && b.bb && b.bb.fear, 3));
    if (ctx.addBandGlobal({ tag: 'fear_tile', row: t.row, col: t.col, fear })) ev.done = true;
  },
});

/** 宝藏探机: deploy a “模拟宝藏” on the chosen tile (+`coin` when it survives the battle). */
K.skill_add_pos_effect_enemy = (ps) => ({
  onBandSkill(ctx, ev) {
    const t = ev.target;
    const p = ps[0] || {};
    if (!t || !Number.isInteger(t.row) || !Number.isInteger(t.col) || !p.enemy_id) return;
    const mark = { tag: 'treasure', row: t.row, col: t.col, enemyId: p.enemy_id, coin: Math.max(1, int(p.coin, 1)) };
    if (ctx.addBandGlobal(mark)) ev.done = true;
  },
});

/**
 * 电气化！: the chosen shop equipment is destroyed at once; at the next battle's start every deployed operator with a
 * free slot holds it until the battle ends (a lent item, items/battle.js installItem). Equipment that destroys itself
 * on equip cannot be chosen.
 */
K.skill_mark_shop_equip_tag = (_ps) => ({
  onBandSkill(ctx, ev) {
    const i = ev.target && Number.isInteger(ev.target.slot) ? ev.target.slot : -1;
    const slot = i >= 0 ? ctx.shopSlots()[i] : null;
    if (!slot || slot.kind !== 'item' || slot.sold) return;
    const rec = ctx.gd.item(slot.id);
    if (!rec || String(rec.kind || '').startsWith('consume_on_equip')) return;
    const mark = { tag: 'lend_equip', itemId: slot.id, slots: Math.max(1, ctx.gd.equipPerChess ?? 2) };
    if (!ctx.addBandGlobal(mark)) return;
    ctx.setShopSlot(i, null); // "立刻销毁"
    ev.done = true;
  },
});

// ---- act3 no-key skills and the remaining prep passives (B5) ----------------------------------------------------

/** 条文修正: every active bond the target operator counts gets +initial_count layers (`initial_count` 9). */
K.skill_act_bond_grow_garr_cnt = (ps) => ({
  onBandSkill(ctx, ev) {
    const p = ps[0] || {};
    const n = Math.max(1, int(p.initial_count ?? p.max_count, 9));
    let added = 0;
    for (const b of ctx.pieceBonds(ev.target.uid)) {
      if (!ctx.bondActive(b)) continue;
      added += ctx.addLayers(b, n, { requireActive: true, reason: 'band' }) || 0;
    }
    if (added > 0) ev.done = true;
  },
});

/** 不稳定要素: the target becomes a random operator one tier higher (never above 6). */
K.skill_transform_char_up_tier = (_ps) => ({
  onBandSkill(ctx, ev) {
    const p = ctx.piece(ev.target.uid);
    if (!p) return;
    const tier = Math.min(6, Math.max(1, p.tier || 1) + 1);
    if ((p.tier || 1) >= 6) return; // already the highest tier
    const id = ctx.rollChess({ tier });
    if (!id || id === p.id) return;
    if (ctx.transform(ev.target.uid, id)) ev.done = true;
  },
});

/**
 * 献身护卫: own 目标生命值 drops to the lowest player's, and the loss (≤ `max_count`) pays as funds; at this prep's
 * end that player is healed by the same amount (capped at its band's totalHp).
 */
K.skill_drop_hp_to_low_gain_coin = (ps) => ({
  onBandSkill(ctx, ev) {
    const maxCoin = Math.max(0, int(ps[0] && ps[0].max_count, 10));
    const pool = [ctx, ...ctx.teammates().filter((t) => t.alive())];
    const low = Math.min(...pool.map((t) => t.lp()));
    const loss = ctx.lp() - low;
    if (!(loss > 0)) return; // already the lowest: nothing to give
    const lowCtx = pool.find((t) => t.lp() === low) || null;
    const coin = Math.min(loss, maxCoin);
    ctx.setLp(low);
    if (coin > 0) ctx.addFunds(coin, 'band');
    ctx.setCounter('band:protect:heal', coin);
    ctx.setCounter('band:protect:seat', lowCtx ? lowCtx.seat : -1);
    ev.done = true;
  },
  onPrepEnd(ctx) {
    const n = ctx.counter('band:protect:heal');
    if (!(n > 0)) return;
    const seat = ctx.counter('band:protect:seat');
    ctx.setCounter('band:protect:heal', 0);
    const t = [ctx, ...ctx.teammates()].find((x) => x.seat === seat);
    if (t) t.setLp(t.lp() + n);
  },
});

/** 最佳品味: `count` random operators of the shop, for free (their slots empty). */
K.skill_take_shop_char = (ps) => ({
  onBandSkill(ctx, ev) {
    const n = timesOf(ps[0] && ps[0].count, 1);
    let taken = 0;
    for (const i of ctx.rng.shuffle(chessSlots(ctx).slice())) {
      if (taken >= n) break;
      if (!ctx.grantChess(ctx.shopSlots()[i].id, { source: 'band' })) continue;
      ctx.setShopSlot(i, null);
      taken++;
    }
    if (taken > 0) ev.done = true;
  },
});

/** 二重奏: the round's first elite merge offers one more promotion reward. */
K.promote_char_extra_award = (_ps) => ({
  onMerge(ctx, ev) {
    if (!ev || ev.kind !== 'chess') return;
    if (roundCounter(ctx, 'band:bonus') > 0) return;
    if (ctx.promotionReward()) bumpRound(ctx, 'band:bonus');
  },
});

/** 精巧设计 (passive half): the round's first equipment merge offers `count` items (one tier above the shop possible). */
K.promote_equip_extra_award = (ps) => ({
  onMerge(ctx, ev) {
    if (!ev || ev.kind !== 'item') return;
    if (roundCounter(ctx, 'band:equipment:merge') > 0) return;
    const want = timesOf(ps[0] && ps[0].count, 3);
    const maxTier = Math.max(1, Math.min(6, ctx.shopLevel() + 1));
    const ids = [];
    for (let k = 0; k < want * 6 && ids.length < want; k++) {
      const id = ctx.rollItem({ maxTier });
      if (!id) break;
      if (!ids.includes(id)) ids.push(id);
    }
    if (!ids.length) return;
    ctx.offerItems(ids, { source: 'band' });
    bumpRound(ctx, 'band:equipment:merge');
  },
});

/** 沙洲梦魇: every `count` of the bond's operators gained earns `value` off the current level's next shop upgrade. */
K.gain_bond_cnt_shop_up_discount = (ps) => ({
  onGain(ctx, ev) {
    const p = ps[0] || {};
    if (!ev || !ev.piece || ev.piece.kind !== 'chess' || !hasBond(ctx, ev.piece.id, p.bond)) return;
    const every = Math.max(1, int(p.count, 3));
    if (ctx.incCounter('band:sargon:got', 1) % every !== 0) return;
    ctx.shopUpDiscount(Math.max(1, int(p.value, 3)));
  },
});

// The act3 records of these two act2 behaviours carry the same blackboards under the official new keys.
K.shop_up_bond_refresh_once = K.up_shop_next_refresh_must_present_bond_char;
K.buy_bond_char_gain_coin = K.round_start_gain_coin_by_bond_char_chess_buy;

K.preparation_start_add_special_goods_every_n_round = (ps) => ({
  onPrepStart(ctx) {
    const p = ps[0];
    const n = int(p.round, 0);
    if (n <= 0 || ctx.round % n !== 0) return;
    const ids = rollItems(ctx, p.pool, Math.min(bbCap('refresh_cnt'), Math.max(1, int(p.refresh_cnt, 2))));
    const choices = Math.min(bbCap('choice_cnt'), Math.max(1, int(p.choice_cnt, 1)));
    for (let k = 0; k < choices && ids.length; k++) ctx.offerItems(ids, { source: 'band' });
  },
});

// ---------------------------------------------------------------------------------------------------------------
// 鸭爵 “神秘顾客”: "从第5回合起，你和队友遭遇的部分敌人可能会替换为<鸭爵><高普尼克><流泪小子><圆仔>，击倒这些敌人者获得1资金奖励
// （包括联防阶段）". A global handler rewrites the battle spawn list of every alive player while the band is held by that
// player or a teammate: from round `round`, in the normal battle, the Final Assault and the Hidden Core (PRTS 卫戍协议：盟约
// 下半/PRTS盟约记录 鸭爵 备注 "每回合将有0~2名敌人被替换为上述敌人之一…且在最终回合和隐秘核心回合中仍然生效"; the 联防 phase
// replaces nothing: its enemies are leaks, which keep their bounty). One draw per round for every player (GitHub #839:
// 「每回合…被替换」, the key's `all_player`): min..max (0–2, uniform [ASSUMED]) ground enemies of the round's own wave
// (`ev.waveSpawns`: before the player's bounty units, which differ per player) from the `minweight`–`maxweight` share of
// that wave's units in time order, the leader and its parts left out of the share [ASSUMED reading of the two weights] —
// any wave enemy but the leader, its parts and uncounted units —, with a stream of its own from the match seed
// (`ctx.seedFor('duck:<round>')`: no player's meta stream, the same in the previews), so every player has the same count,
// the same units and the same enemies [ASSUMED: the same enemy for every player — the report says the same enemy is
// swapped]; each player's list swaps the k-th own unit of the picked action at its own (bounty-re-timed) time and route.
// The draw keeps the time share: no lane rule (the report's 「总在下路」 is not settled by its recording; [ASSUMED] until a
// recording or the maintainer's recall shows the upper lane is never used). Elites are eligible
// too [ASSUMED: the text names no rank; one rule for every battle; about two thirds of the leader rounds' escorts in that
// share are elites, so a NORMAL-only rule would leave most Final Assault halves without a candidate — ≈ 80 % instead of
// ≈ 36 % of the R14 pair-field halves over 40 seeds]. Flyers are never swapped [ASSUMED: the four are ground units and a
// FLY action's route is a FLY route]. A swapped unit becomes a random enemylist enemy (the act2 `_2` versions) at the
// replaced unit's time and route, worth DUCK_COINS to its killer (bounty, also in 联防). A pair boss field has one spawn
// list that its two players' handlers edit in turn; each player's 0–2 come from the enemies whose route ends on that
// player's half (`ev.side` + `ev.routes`, the half rule of the field's bounties, server/match/waves.js routeByMotion), the
// share taken over that half [ASSUMED: "你和队友遭遇的敌人" — the enemies heading for the player's own protection point;
// each official client simulates its own battle, docs/research/08 appendix A], with the same round stream on both halves
// (no side salt [ASSUMED]): halves that line up pick mirrored units; a half of three or fewer units has none in the share.
// The originals never exist, so none of
// their death / kill / leak effects happen. Reaching the protection point costs 1 LP ("但进入保护目标点将减少1点目标生命值":
// the enemies' data lpr, tools/build-data.mjs). The swaps carry the spawn tag 'duck': their 隐匿 (流泪小子) comes back no
// sooner than 1 s after a block ends, not the official 0 s (content/enemies/helpers.js DUCK_STEALTH_RESTORE — the owner's
// decision of 2026-10-07, a deliberate deviation).

export const DUCK_BAND = 'band_ducklord';
/** "击倒这些敌人者获得1资金奖励" (the blackboard's `count` is 1 too). */
export const DUCK_COINS = 1;
/** Battle kinds the swap applies to (PRTS: the Final Assault and the Hidden Core too). */
const DUCK_KINDS = new Set(['normal', 'boss', 'hidden']);
/** Boss-field column between the left ('L') and the right ('R') player's half (the goals are at cols 2–3 / 17). */
const BOSS_MID_COL = (GEO.BOSS_RECT.c0 + GEO.BOSS_RECT.c1) / 2;

function duckParams(bandId = DUCK_BAND) {
  for (const b of buffsOf(bandRecord(bandId))) if (b.key === 'round_start_all_player_change_enemy_2') return b.p;
  return null;
}

/** The identity of a wave unit: its action (`actionIndex`), else the spec's place among the list's own specs. */
const unitAction = (s, pos) => (Number.isInteger(s.actionIndex) ? s.actionIndex : `#${pos}`);
/** A spawn the swap never counts as the wave's own: bounty units (per player) and earlier swaps. */
const notOwn = (s) => !s || s.tag === 'bounty' || s.tag === 'duck';

/**
 * The round's swaps (exported for tests): `{ action, k, enemyKey }` — the k-th unit of a wave action becomes enemyKey.
 * Drawn from `base`, the round's own wave (no bounty units: they differ per player), so every player who uses the same
 * `rng` stream on the same wave gets the same count, the same units and the same 鸭爵 enemies (GitHub #839). `side`
 * ('L' | 'R', a pair boss field) limits the draw to the units whose route (`routes[routeIndex]`) ends on that half.
 */
export function duckPicks(gd, rng, base, p, { routes = null, side = null } = {}) {
  const ducks = list(p.enemylist).filter((k) => gd.enemy(k));
  if (!ducks.length || !Array.isArray(base)) return [];
  const lo = Math.max(0, int(p.min, 0)), hi = Math.max(lo, int(p.max, lo));
  const want = lo + rng.int(hi - lo + 1);
  if (want <= 0) return [];
  const half = side === 'L' || side === 'R';
  const onHalf = (s) => {
    if (!half) return true;
    const r = Array.isArray(routes) ? routes[s.routeIndex] : null;
    const c = r && Array.isArray(r.end) ? Number(r.end[1]) : NaN;
    return side === 'R' ? c > BOSS_MID_COL : c < BOSS_MID_COL;
  };
  // one entry per enemy of the wave (split multi-count specs), in spawn-time order
  const flat = [];
  const seen = new Map();
  let pos = -1;
  for (let i = 0; i < base.length; i++) {
    const s = base[i];
    if (notOwn(s)) continue;
    pos++;
    const action = unitAction(s, pos);
    const cnt = Math.max(1, int(s.count, 1));
    const k0 = seen.get(action) ?? 0;
    seen.set(action, k0 + cnt);
    // the leader and its parts are not in the share either [ASSUMED: the client never sends the leader's action to the
    // server (ShouldActionUpToServer, waves.js templateSpawns), so a draw for every player sees the escorts only; it
    // also keeps a pair field's two halves alike — the leader's route ends on one of them]
    if (!onHalf(s) || s.tag === 'boss' || s.tag === 'part') continue;
    for (let k = 0; k < cnt; k++) flat.push({ i, action, k: k0 + k, t: num(s.time, 0) + k * num(s.interval, 0) });
  }
  flat.sort((a, b) => a.t - b.t || a.i - b.i || a.k - b.k);
  const w0 = num(p.minweight, 0), w1 = num(p.maxweight, 1);
  const n = flat.length;
  const ok = flat.filter((f, j) => {
    const s = base[f.i];
    const e = gd.enemy(s.enemyKey);
    const frac = n > 1 ? j / (n - 1) : 0;
    return !s.tag && s.countInTotal !== false && e && e.rank !== 'BOSS' && !e.notCountInTotal && e.stats?.motion !== 'FLY'
      && frac >= w0 - 1e-9 && frac <= w1 + 1e-9;
  });
  return rng.shuffle(ok).slice(0, want).map((f) => ({ action: f.action, k: f.k, enemyKey: rng.pick(ducks) }));
}

/**
 * Apply the round's swaps to a player's spawn list in place (exported for tests): the k-th own unit of each picked
 * action — counted over the list's own specs of that action in list order, so a run re-timed around bounty units
 * (waves.js withBounties) still finds it — becomes the swap at that player's own time and route. Returns the swaps.
 */
export function applyDuckPicks(spawns, picks, ownerPlayerId) {
  if (!Array.isArray(spawns) || !picks.length) return [];
  const byAction = new Map();
  for (const pk of picks) { if (!byAction.has(pk.action)) byAction.set(pk.action, new Map()); byAction.get(pk.action).set(pk.k, pk.enemyKey); }
  const seen = new Map();
  const out = [];
  const next = [];
  let pos = -1;
  for (const s of spawns) {
    if (notOwn(s)) { if (s) next.push(s); continue; }
    pos++;
    const action = unitAction(s, pos);
    const cnt = Math.max(1, int(s.count, 1));
    const k0 = seen.get(action) ?? 0;
    seen.set(action, k0 + cnt);
    const ks = byAction.get(action);
    if (!ks || ![...ks.keys()].some((k) => k >= k0 && k < k0 + cnt)) { next.push(s); continue; }
    const one = (j) => ({ ...s, mods: s.mods ? { ...s.mods } : undefined, count: 1, interval: 0, time: num(s.time, 0) + j * num(s.interval, 0) });
    for (let j = 0; j < cnt; j++) {
      const key = ks.get(k0 + j);
      if (key == null) { next.push(one(j)); continue; } // the unreplaced copies of a multi-count spec, at their own times
      const d = { ...one(j), enemyKey: key, tag: 'duck', bounty: { coins: DUCK_COINS, ownerPlayerId } };
      if (d.mods) delete d.mods.slot;
      out.push(d);
    }
  }
  spawns.length = 0;
  spawns.push(...next, ...out);
  return out;
}

/**
 * Rewrite `spawns` in place (exported for tests): draw the swaps from `base` (default: `spawns` without its bounty
 * units) with `rng` (default ctx.rng) and apply them. Returns the replaced spawn specs.
 */
export function duckReplace(ctx, spawns, p, ownerPlayerId, { routes = null, side = null, base = null, rng = ctx.rng } = {}) {
  if (!Array.isArray(spawns)) return [];
  const picks = duckPicks(ctx.gd, rng, Array.isArray(base) ? base : spawns.filter((s) => !notOwn(s)), p, { routes, side });
  return applyDuckPicks(spawns, picks, ownerPlayerId);
}

const duckGlobal = {
  onBattleStart(ctx, ev) {
    if (!ev || !DUCK_KINDS.has(ev.kind) || !Array.isArray(ev.spawns)) return;
    const holder = [ctx, ...ctx.teammates()].find(t => (t.gd.band(t.bandId())?.effectRef ?? t.bandId()) === DUCK_BAND);
    if (!holder) return;
    const p = duckParams(holder.bandId());
    if (!p || ctx.round < int(p.round, 1)) return;
    // one draw per round for every player (GitHub #839): its own stream from the match seed — no player's meta stream,
    // the same in the stats preview and the bot rehearsals — on the wave before the player's bounties (ev.waveSpawns)
    const rng = typeof ctx.seedFor === 'function' ? createRng(ctx.seedFor(`duck:${ctx.round}`)) : ctx.rng;
    duckReplace(ctx, ev.spawns, p, ctx.playerId, { routes: ev.routes, side: ev.side, base: ev.waveSpawns, rng });
  },
};

// ---------------------------------------------------------------------------------------------------------------

/** Merge hook objects (same hook → called in order). */
function merge(parts) {
  const out = {};
  for (const h of parts) {
    for (const [name, fn] of Object.entries(h)) {
      if (typeof fn !== 'function') continue;
      const prev = out[name];
      out[name] = prev ? function merged(ctx, ev) { prev(ctx, ev); fn(ctx, ev); } : fn;
    }
  }
  return out;
}

/** Hooks of one set of buffs (null when it has no prep effect). */
function buffHooks(buffs, bandId) {
  const groups = new Map();
  for (const b of buffs) {
    if (!b.key || !K[b.key]) continue;
    if (!groups.has(b.key)) groups.set(b.key, []);
    groups.get(b.key).push(b.p);
  }
  if (!groups.size) return null;
  return merge([...groups].map(([k, ps]) => K[k](ps, bandId)));
}

/**
 * Hooks of one band (null when it has no prep effect). An official skill's upgrade chain (`skill.stages`) gives one
 * set of hooks per stage; only the stage in force (shared/bandSkill.js) runs on each hook, so an upgrade's numbers and
 * its different buff keys (药枚实验's 20 % → 35 % tag) apply without stacking the base ones.
 */
export function bandMetaHandler(bandId) {
  const band = bandRecord(bandId);
  const stages = bandSkillStages(band);
  const per = stages.map((st, i) => buffHooks(i === 0 ? buffsOf(band) : buffsOf(effectRecord(st.effectId)), bandId));
  if (!per.some(Boolean)) return null;
  if (per.length === 1) return per[0];
  const names = new Set(per.flatMap((h) => (h ? Object.keys(h) : [])));
  const out = {};
  for (const name of names) {
    out[name] = function staged(ctx, ev) {
      const idx = activeBandSkillIndex({
        round: ctx.round, shopLevel: ctx.shopLevel(), gold: ctx.stats().gold, bonds: ctx.bonds(),
      }, stages);
      const h = per[idx];
      if (h && typeof h[name] === 'function') h[name](ctx, ev);
    };
  }
  return out;
}

export function registerMeta(registry) {
  for (const id of Object.keys(gameData().bands || {})) {
    const h = bandMetaHandler(id);
    if (h) registry.band(id, h);
  }
  registry.global('bands_ducklord', duckGlobal);
}
