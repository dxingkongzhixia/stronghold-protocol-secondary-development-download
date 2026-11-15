// server/match/player/views.js — PlayerState methods: the views — pieceView, effectsView (the effects column: 策略 / 机变 /
// 悬赏 …) and m.private (privateView).
// Installed on PlayerState.prototype by server/match/PlayerState.js (a method container: never instantiated; `this` is
// the player state).

import { PHASE } from '../../../shared/constants.js';
import { boardOrder, pieceDir } from '../board.js';
import { bondList, offBondCounts } from '../bondsMeta.js';
import { bountyText, bountyCard } from '../choices.js';
import { activeBandSkillStage, bandSkillStages } from '../../../shared/bandSkill.js';

export class PlayerViews {
  pieceView(p, rc = null) {
    const rec = p.kind === 'item' ? this.gd.item(p.id) : p.kind === 'token' ? this.gd.token(p.id) : this.gd.chess(p.id);
    const v = {
      uid: p.uid,
      kind: p.kind,
      id: p.id,
      golden: !!(rec && rec.isGolden),
      tier: rec && Number.isInteger(rec.tier) ? rec.tier : null,
      items: p.kind === 'chess' ? (p.items || []).map((it) => ({ uid: it.uid, id: it.id })) : [],
      count: p.kind === 'token' ? (p.count || 1) : 1,
      ownerUid: p.kind === 'token' ? p.ownerUid ?? null : null,
    };
    if (p.kind === 'chess') {
      const diy = typeof this.diyPickOf === 'function' ? this.diyPickOf(p.id) : null;
      const skinId = this.skinFor(rec, diy ? diy.charId : null);
      if (skinId) v.skin = skinId;
    }
    if (rc) { v.row = rc[0]; v.col = rc[1]; v.dir = pieceDir(p); }
    return v;
  }

  /**
   * 规程 active strategy skill (`m.private.bandSkill`): the band record's official `skill` walk (shared/bandSkill.js),
   * with the uses / cooldown the intent keeps in PlayerState.bandSkill and the live price. Null for every band without
   * an ACTIVE skill (all of the default 盟约 set), so the default private view does not change.
   */
  bandSkillView() {
    const band = this.bandId ? this.gd.band(this.bandId) : null;
    if (!band) return null;
    const stages = bandSkillStages(band);
    const stage = activeBandSkillStage({
      round: this.m.round, shopLevel: this.shop.level, gold: this.stats?.gold ?? 0, bonds: this.bonds,
    }, stages);
    const sk = stage && stage.skill;
    if (!sk || sk.type !== 'ACTIVE') return null;
    const round = this.m.round;
    const st = this.bandSkill || { uses: 0, total: 0, round: 0, cooldownUntil: 0 };
    const usedThisRound = st.round === round ? (st.uses || 0) : 0;
    const cap = Math.max(1, Number.isInteger(sk.availCount) && sk.availCount > 0 ? sk.availCount : 1);
    // the price hook is read-only by contract (meta.js): a cost that grows / falls is shown as the intent would charge it
    const priced = { cost: Math.max(0, Math.round(Number(sk.cost) || 0)) };
    if (typeof this.m.dispatch === 'function') this.m.dispatch(this, 'onBandSkillPrice', priced);
    const cost = Math.max(0, Math.round(Number(priced.cost) || 0));
    const cooldown = sk.availType === 'COOLDOWN' ? Math.max(0, (st.cooldownUntil || 0) - round) : 0;
    // DEFAULT ("可再次使用") has no per-round count: the growing cost is the limit, so the HUD shows no count
    const unlimited = sk.availType === 'DEFAULT';
    const usesLeft = sk.availType === 'ALL_LIMIT' ? Math.max(0, cap - (st.total || 0))
      : sk.availType === 'COOLDOWN' || unlimited ? null
        : Math.max(0, cap - usedThisRound);
    return {
      name: band.effectName || band.name,
      bandName: band.name,
      desc: band.desc || '',
      targetType: sk.targetType || 'NO_TARGET',
      cost,
      funds: this.funds,
      cap,
      usesLeft,
      cooldown,
      stage: stages.indexOf(stage),
      stages: stages.length,
      available: this.m.phase === PHASE.PREP && this.alive && !this.ready
        && (sk.availType === 'COOLDOWN' ? cooldown === 0 : unlimited || usesLeft > 0),
    };
  }

  effectsView() {    const out = [];
    const band = this.bandId ? this.gd.band(this.bandId) : null;
    if (band) out.push({ id: band.effectId || band.bandId, name: band.effectName || band.name, desc: band.desc || '', iconKind: 'band', iconId: band.iconId || band.bandId });
    for (const e of this.effects) {
      if (e.hidden) continue;
      const v = { id: e.id, name: e.name || e.id, desc: e.desc || '', iconKind: e.iconKind || 'choice', iconId: e.iconId || e.id };
      if (e.counter != null) v.counter = e.counter;
      out.push(v);
    }
    for (const b of this.bounties) {
      // the battles the bounty's enemies still come for (an official multi-round card: every battle, no counter) and
      // the card's official rich text (blue "下场作战" / "两场作战", red "每场"; a multi-round card reads as long as it
      // lasts — choices.js bountyText, MULTI_ROUND_BOUNTY_BATTLES) — user playtest #6 item 4
      const left = b.roundsLeft >= 90 ? null : b.roundsLeft;
      const eff = b.card.effectId ? this.gd.effect(b.card.effectId) : null;
      out.push({
        id: b.id, name: b.card.name || '悬赏', desc: bountyText((eff && eff.descRaw) || b.card.desc || '', b.card), iconKind: 'choice', iconId: b.card.effectId || 'bounty', // i18n-ignore: a data-less card's fallback name
        counter: left, counterText: left == null ? '之后的每场作战' : `还剩 ${left} 场作战`, // i18n-ignore: older clients (ui/effectsList.js builds it from counter)
      });
    }
    return out;
  }

  privateView() {
    const slots = this.shop.slots.map((s) => (s ? { kind: s.kind, id: s.id, price: this.priceOf(s), basePrice: s.basePrice, sold: !!s.sold, frozen: !!s.frozen } : null));
    const offer = this.offers[0] || null;
    const free = this.shop.freeRefreshes > 0;
    const board = [];
    for (const { r, c, piece } of boardOrder(this.board)) board.push(this.pieceView(piece, [r, c]));
    // a boss round's prep: the partner's board on its half of the boss field (Match.bossMateView, item 51)
    const bossMate = typeof this.m.bossMateView === 'function' ? this.m.bossMateView(this) : null;
    return {
      t: 'm.private',
      playerId: this.playerId,
      seat: this.seat,
      alive: this.alive,
      lp: this.lp,
      // 分血救援 (REVIVE): the downed player's own banner (pool progress) and his revive count
      downed: !!this.downed,
      revivePool: this.revivePool,
      reviveNeed: this.reviveNeed,
      revivesUsed: this.revivesUsed,
      funds: this.funds,
      bandId: this.bandId,
      ready: this.ready,
      // 规程 personal briefing: the core bonds split into two groups, and this player's pick
      coreBond: this.m.coreBondGroups ? { groups: this.m.coreBondGroups.map((g) => g.slice()), pick: this.coreBondPick } : null,
      // 规程 active strategy skill (g.bandSkill): null for every band without one (the default 盟约 set has none)
      bandSkill: this.bandSkillView(),
      canReady: this.alive && this.tempEmpty && !this.personalChoice && this.m.phase === PHASE.PREP,
      personalChoice: this.personalChoice ? {
        id: this.personalChoice.id,
        round: this.personalChoice.round,
        sourceItemId: this.personalChoice.sourceItemId,
        cards: this.personalChoice.cards.map((c) => bountyCard(this.gd, c)),
      } : null,
      shop: {
        level: this.shop.level,
        maxLevel: this.gd.maxShopLevel,
        upgradePrice: this.shop.level >= this.gd.maxShopLevel ? 0 : this.shop.upgradePrice,
        refreshPrice: free ? 0 : this.gd.refreshPrice,
        freeRefreshes: this.shop.freeRefreshes,
        frozen: this.shop.frozen,
        slots,
        // `source` 'merge' = the promotion reward (晋升奖励); any other offer (a strategy, an item, a 特质) carries the
        // `label` the bar shows instead; `queued` = offers waiting behind it (player report #6 after 0.1.0)
        rewardOffer: offer ? { tier: offer.tier, source: offer.source === 'merge' ? 'merge' : 'special', label: offer.label || null, queued: this.offers.length - 1, slots: offer.slots.map((s) => ({ kind: s.kind === 'item' ? 'item' : 'chess', id: s.id, price: s.price, sold: !!s.sold })) } : null,
      },
      hand: this.hand.map((p) => (p ? this.pieceView(p) : null)),
      // 规程: the separate equipment area (empty in the 盟约 default, where equipment shares the hand)
      equipHand: this.equipHand.map((p) => (p ? this.pieceView(p) : null)),
      temp: this.temp.map((p) => (p ? this.pieceView(p) : null)),
      board,
      // The stage's 外勤医疗 reserve medic is present during prep, but is not a draggable board piece.
      prepMapChars: this.m.prepMapChars(this),
      deployCap: this.deployCap,
      deployCount: this.deployCount,
      // + the mode-off bonds it has members of (`off: true`, the strip's grey 本局禁用 discs — bondsMeta.offBondCounts)
      bonds: bondList(this.gd, this.bondsView(), { full: true, off: offBondCounts(this.gd, this) }),
      effects: this.effectsView(),
      nextEnemies: this.m.nextEnemiesFor(this),
      // DESIGN §16: the effective operator loadout ({ [baseChessId]: { skill, module } }; chess not listed use defaults)
      loadout: this.loadout,
      // 0.2.2: the effective per-operator 潜能 / 练度 ({ [charId]: { potential, cultivate } }; operators not listed: 潜能 6,
      // 精英2 Lv.60) — the client's cards compose the numbers from it (shared/potential.js)
      ops: this.ops,
      // 0.2.0 补位: the base chess ids this player fields as their stand-ins in this match (the not-owned list the seat had
      // at the match start; [] = every operator owned) — the client shows these as their stand-ins (cards, pieces, the
      // detail card, with a small 「替补」 mark)
      standIns: this.standIns,
      // 0.2.0 自选编队: this player's 自选 picks in this match ({ [slotBaseId]: { charId, skillIndex, uniEquipId } } — the seat's
      // when the match started; {} = none) — the client composes the operator's record for its own cards and pieces
      // (shared/diy.js diyRecord); `diyBanned`: the slotted slots out of the shop this match (every bond of the operator
      // switched off)
      diy: this.diy,
      diyBanned: this.diyBanned,
      // 最终攻势 / 隐秘核心 prep (community report of 2026-10-06, item 51): `{ playerId, side, units }` — the pair partner's
      // board pieces as UnitInfo on its half of the boss field (mirrored on the right half, as the battle places them);
      // the own prep view draws them beside the own half, read-only. Absent otherwise.
      ...(bossMate ? { bossMate } : {}),
      stats: {
        dmgDealt: Math.round(this.stats.dmgDealt), kills: this.stats.kills, leaks: this.stats.leaks, gold: this.stats.gold,
        refreshes: this.stats.refreshes, merges: this.stats.merges,
      },
    };
  }
}
