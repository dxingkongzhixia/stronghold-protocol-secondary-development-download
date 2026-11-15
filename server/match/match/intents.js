// server/match/match/intents.js — Match methods: the g.* / b.* intent router (_handle: the prep intents go to
// PlayerState, the drafts, watching, the pause and the battle reports to the match), emotes, AI 托管 (setAutoplay,
// kickBot) and g.unitStats (the stats the board's units start their next battle with: a preview battle, started, read
// and dropped).
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { unitStatsEntry } from '../../../shared/protocol.js';
import { PHASE, ERR, EMOTES, EMOTE_COOLDOWN_MS, GEO, REVIVE } from '../../../shared/constants.js';
import { activeBandSkillStage, bandSkillStages } from '../../../shared/bandSkill.js';
import { deriveSeed } from '../../sim/rng.js';
import { msg } from '../../../shared/i18n.js';
import { OK, fail, FLOW_TICKER_PRIORITY } from './common.js';
import { onHumanEmote } from '../botEmotes.js';

export class MatchIntents {
  _handle(ps, msg) {
    switch (msg.t) {
      case 'g.infoReady':
        if (this.phase !== PHASE.INFO_CHECK) return fail(ERR.WRONG_PHASE);
        if (this.setupVote) return fail(ERR.WRONG_PHASE, 'setup reroll vote in progress');
        if ((msg.setupRevision ?? 0) !== this.setupRevision) return fail(ERR.BAD_TARGET, 'setup changed; confirm the current revision');
        if (!ps.infoReady) { ps.infoReady = true; this.markPublic(); this.maybeEndInfo(); }
        return OK;
      case 'g.rerollVote': return this.voteSetupReroll(ps, msg.voteId, msg.agree);
      case 'g.coreBond': return this.applyCoreBondChoice(ps, msg.group);
      case 'g.band': return this.pickBand(ps, msg.bandId);
      case 'g.bandSkip': return this.skipBand(ps);
      // the strategy highlighted in the draft screen (what a timed-out turn takes, timeoutBand)
      case 'g.bandFocus': return this.bandFocus(ps, msg.bandId ?? null);
      // an active strategy skill (another official version's band): target a chess / shop slot / map tile or nothing
      case 'g.bandSkill': return this.useBandSkill(ps, msg);
      case 'g.buy': return ps.buy(msg.slot);
      case 'g.refresh': return ps.refresh();
      case 'g.freeze': return ps.freeze();
      case 'g.levelUp': return ps.levelUp();
      case 'g.sell': return ps.sell(msg.uid);
      // dir: the deploy wheel's facing (DESIGN §3; absent ⇒ PlayerState reads to.dir, then RIGHT)
      case 'g.move': return ps.move(msg.uid, msg.to, msg.dir);
      case 'g.equip': return ps.equip(msg.itemUid, msg.targetUid, msg.replaceUid ?? null);
      case 'g.art': return ps.useArt(msg.itemUid, msg.row, msg.col, msg.dir);
      case 'g.destroy': return ps.destroy(msg.uid);
      case 'g.clearTemp': return ps.clearTemp();
      case 'g.reward': return ps.pickReward(msg.idx);
      case 'g.choice': return msg.choiceId !== undefined
        ? this.pickPersonalChoice(ps, msg.idx, msg.choiceId)
        : this.pickCard(ps, msg.idx);
      // a plugin interaction window (PLUGIN API v2, docs/PLUGINS.md §10b): the window's own id, not a draft card
      case 'g.offer': return this.requestOffer(ps, msg.offerId, msg.idx, msg);
      case 'g.offerRefresh': return this.requestOfferRefresh(ps, msg.offerId, msg.idx, msg);
      case 'g.ready': return ps.setReady(!!msg.ready);
      case 'g.emote': return this.emote(ps, msg.id);
      case 'g.shareHp': return this.shareHp(ps, msg.target);
      // playerId: the player tapped (a shared field names two) — the watch preference (item 56)
      case 'g.watch': return this.watch(ps, msg.fieldId, msg.playerId ?? null);
      case 'g.autoplay': return this.setAutoplay(ps, !!msg.on);
      case 'g.pause': return this.setPause(ps, !!msg.on);
      // the stats the board's units start their next battle with (the detail card in prep, user playtest #4 item 7)
      case 'g.unitStats': return this.unitStats(ps, msg.seq ?? null);
      case 'g.leave': this.onLeave(ps.playerId); return OK;
      case 'b.progress': return this._onProgress(ps, msg);
      case 'b.result': return this._onResult(ps, msg);
      // the host's answer to a delegated bot layout rehearsal (DESIGN §14): a report, never an error — an unknown,
      // expired or foreign task is ignored (MatchRehearsal._onRehearsalResult)
      case 'b.rehearsalResult': this._onRehearsalResult(ps, msg); return OK;
      default: return fail(ERR.BAD_MSG);
    }
  }

  /**
   * An active strategy skill (`band.skill` of another official version; `g.bandSkill`): availability, target type and
   * cost come from the band record's official metadata; the band handler's `onBandSkill` does the work and may name a
   * cooldown (rounds). Only in PREP.
   * @param {import('../PlayerState.js').PlayerState} ps
   * @param {{ target?: { kind: string, uid?: number, slot?: number, row?: number, col?: number } }} msg
   */
  useBandSkill(ps, msg) {
    if (this.phase !== PHASE.PREP) return fail(ERR.WRONG_PHASE);
    if (ps.ready) return fail(ERR.WRONG_PHASE, 'ready');
    const band = this.gd.band(ps.bandId);
    // the stage in force now: the base record or an upgraded one (round / shop level / coins spent / bond members)
    const stage = band ? activeBandSkillStage({
      round: this.round, shopLevel: ps.shop.level, gold: ps.stats?.gold ?? 0, bonds: ps.bonds,
    }, bandSkillStages(band)) : null;
    const sk = stage && stage.skill;
    if (!sk || sk.type !== 'ACTIVE') return fail(ERR.BAD_TARGET, sk ? 'the strategy skill is locked' : 'this strategy has no active skill');
    const st = ps.bandSkill || (ps.bandSkill = { uses: 0, total: 0, round: 0, cooldownUntil: 0 });
    if (st.round !== this.round) { st.round = this.round; st.uses = 0; }
    if (sk.availType === 'COOLDOWN' && this.round < (st.cooldownUntil || 0)) return fail(ERR.BAD_TARGET, 'the skill is cooling down');
    const cap = Math.max(1, Number.isInteger(sk.availCount) && sk.availCount > 0 ? sk.availCount : 1);
    if (sk.availType === 'ALL_LIMIT' && (st.total || 0) >= cap) return fail(ERR.BAD_TARGET, 'the skill has no uses left');
    // DEFAULT ("可再次使用"): no per-round cap — the funds and the handler decide (the growing cost is the limit)
    if (sk.availType !== 'ALL_LIMIT' && sk.availType !== 'COOLDOWN' && sk.availType !== 'DEFAULT' && (st.uses || 0) >= cap) return fail(ERR.BAD_TARGET, 'the skill has no uses left');
    const target = msg.target ?? null;
    const bad = this.bandSkillTargetError(ps, sk, target);
    if (bad) return fail(bad, 'not a valid target for this strategy');
    // the price can move (a skill whose cost grows with the rounds / falls with bond purchases); that hook is read-only
    const priced = { cost: Math.max(0, Math.round(Number(sk.cost) || 0)) };
    this.dispatch(ps, 'onBandSkillPrice', priced);
    const cost = Math.max(0, Math.round(Number(priced.cost) || 0));
    if (cost > 0 && ps.funds < cost) return fail(ERR.NO_FUNDS);
    // the handler does the work and sets `ev.done` (the only sign it actually acted: an empty pool / a full hand fails)
    const ev = { target, skill: sk, band, cost, cooldown: sk.availType === 'COOLDOWN' ? Math.max(1, Math.round(Number(sk.availCount) || 1)) : 0, done: false };
    this.dispatch(ps, 'onBandSkill', ev);
    if (!ev.done) return fail(ERR.BAD_TARGET, 'the strategy has nothing to do with that target');
    if (cost > 0) { ps.spend(cost); ps._afterSpend(cost, 'effect'); }
    st.uses = (st.uses || 0) + 1;
    st.total = (st.total || 0) + 1;
    if (sk.availType === 'COOLDOWN') st.cooldownUntil = this.round + Math.max(1, Math.round(Number(ev.cooldown) || 1));
    // bookkeeping that only a successful use does (a cost that grows / resets): after the charge, never on a failure
    this.dispatch(ps, 'onBandSkillUsed', ev);
    ps.dirty();
    this.markPublic();
    return OK;
  }

  /** The ERR code a band skill target fails, or null. @param {import('../PlayerState.js').PlayerState} ps */
  bandSkillTargetError(ps, sk, target) {
    const kind = sk.targetType;
    if (kind === 'NO_TARGET' || kind == null) return target ? ERR.BAD_TARGET : null;
    if (!target || typeof target !== 'object') return ERR.BAD_TARGET;
    if (kind === 'COMMON_CHESS') {
      if (target.kind !== 'chess' || !Number.isInteger(target.uid)) return ERR.BAD_TARGET;
      const loc = ps.find(target.uid);
      return loc && loc.piece && loc.piece.kind === 'chess' ? null : ERR.BAD_TARGET;
    }
    if (kind === 'SHOP_SLOT') {
      if (!Number.isInteger(target.slot)) return ERR.BAD_TARGET;
      const slot = ps.shop.slots[target.slot];
      return slot && !slot.sold ? null : ERR.BAD_TARGET;
    }
    if (kind === 'MAP_TILE') {
      return Number.isInteger(target.row) && Number.isInteger(target.col)
        && target.row >= 0 && target.row < GEO.ROWS && target.col >= 0 && target.col < GEO.COLS ? null : ERR.BAD_TARGET;
    }
    return ERR.BAD_TARGET;
  }

  /**
   * 分血救援 (REVIVE, owner 2026-10-17): a living human hands REVIVE.DONATE of his own LP to a DOWNED teammate. 休整期
   * only, never after the Final Assault took its teamLp snapshot; the donor's LP must stay at or above REVIVE.FLOOR and
   * the target's pool must still have room. The pool revives the teammate at the next ROUND_START (Match._reviveDowned).
   * @param {import('../PlayerState.js').PlayerState} ps
   * @param {string} targetId
   */
  shareHp(ps, targetId) {
    if (this.phase !== PHASE.PREP) return fail(ERR.WRONG_PHASE);
    if (!ps.alive) return fail(ERR.ELIMINATED);
    const target = this.players.get(targetId);
    if (!target || target === ps || target.isBot || target.left) return fail(ERR.BAD_TARGET);
    if (!target.downed) return fail(ERR.BAD_TARGET, 'not downed');
    if (this.teamLp != null || this.phase === PHASE.FINAL_ASSAULT || this.phase === PHASE.HIDDEN_CORE) return fail(ERR.WRONG_PHASE, 'final assault started');
    if (target.revivePool >= target.reviveNeed) return fail(ERR.ALREADY, 'pool full');
    // each living teammate may give ONE point to the same downed teammate per downing
    if (Array.isArray(target.reviveGivers) && target.reviveGivers.filter((id) => id === ps.playerId).length >= REVIVE.PER_TARGET) return fail(ERR.ALREADY, 'already gave a point');
    if (ps.lp - REVIVE.DONATE < REVIVE.FLOOR) return fail(ERR.NO_FUNDS, 'insufficient HP');
    ps.lp -= REVIVE.DONATE;
    target.revivePool = Math.min(target.reviveNeed, target.revivePool + REVIVE.DONATE);
    if (!Array.isArray(target.reviveGivers)) target.reviveGivers = [];
    target.reviveGivers.push(ps.playerId);
    ps.dirty();
    target.dirty();
    const cameBack = target.revivePool >= target.reviveNeed && target.revive();
    this.markPublic();
    this.toast(ps, 'info', msg('已分给 {name} {n} 点目标生命', { name: target.name, n: REVIVE.DONATE }));
    if (cameBack) {
      this.toast(target, 'success', msg('你已被队友救回'));
      this.tickerText(msg('{name}博士已被队友救回', { name: target.name }), FLOW_TICKER_PRIORITY);
    } else {
      this.toast(target, 'success', msg('{name} 分给你 {n} 点目标生命', { name: ps.name, n: REVIVE.DONATE }));
      this.tickerText(msg('{name}博士分给队友 {n} 点目标生命', { name: ps.name, n: REVIVE.DONATE }), FLOW_TICKER_PRIORITY);
    }
    return OK;
  }

  emote(ps, id) {
    if (!EMOTES.includes(id)) return fail(ERR.BAD_MSG, 'unknown emote');
    const now = this.sched.now();
    if (now - ps.lastEmoteAt < EMOTE_COOLDOWN_MS) return fail(ERR.RATE);
    ps.lastEmoteAt = now;
    this.broadcast({ t: 'm.emote', playerId: ps.playerId, id });
    // an AI teammate can react to a human's emote (enabled by default: server/match/botEmotes.js, SP_BOT_EMOTES=0 silences it)
    onHumanEmote(this, ps.playerId, id);
    return OK;
  }

  setAutoplay(ps, on) {
    if (ps.autoplay === on) return OK;
    ps.autoplay = on;
    this.markPublic();
    if (on) this.kickBot(ps);
    return OK;
  }

  /** Let the bot act for a (newly) bot-controlled seat in the current phase. */
  kickBot(ps) {
    if (!ps.botControlled || this.ended) return;
    this.offersChanged();
    if (this.phase === PHASE.INFO_CHECK && !ps.infoReady) { ps.infoReady = true; this.markPublic(); this.maybeEndInfo(); }
    else if (this.phase === PHASE.BAND_DRAFT && this.draftTurn() === ps.playerId) this.scheduleBandBot();
    else if (this.phase === PHASE.SP_DRAFT && this.spTurn() === ps.playerId) this.scheduleSpBot();
    else if (this.phase === PHASE.PREP && ps.alive && !ps.ready) this.scheduleBotPrep(ps, 0);
  }

  /**
   * g.unitStats { seq? } (user playtest #4 item 7: the detail card showed fixed record stats): the stats every unit of
   * the player's board will fight with at the start of its next battle — equipment, bonds and their layers, 特质, the
   * band and 机变 effects — computed exactly by the shared sim. The player's battle input after the onBattleStart meta
   * handlers (`ev.preview: true`, no enemies — those handlers must not change the match for a preview) builds a Battle
   * of the battle's options that is started (initial deployment + battleStart hooks), read and dropped: it is never
   * stepped: deployment skills contribute their initial stats but their timers do not advance. No SP / skill timer is
   * sent, and the real battle gets fresh units. Pushed to the player as `m.unitStats { seq, round, units }`
   * (units: shared/protocol.js unitStatsEntry, board operators and summons by uid); cached per input (a build costs
   * ≈ 0.3–0.7 ms). Prep phases only (ROUND_START, 机变, PREP); a battle's live stats come from the browser's own sim.
   * @param {PlayerState} ps @param {number|null} seq echoed (the client keeps the newest answer)
   */
  unitStats(ps, seq = null) {
    if (!ps.alive) return fail(ERR.ELIMINATED);
    if (this.phase !== PHASE.ROUND_START && this.phase !== PHASE.SP_DRAFT && this.phase !== PHASE.PREP) return fail(ERR.WRONG_PHASE);
    const units = this._unitStatsOf(ps);
    this.sendTo(ps.playerId, { t: 'm.unitStats', seq: Number.isInteger(seq) ? seq : null, round: this.round, units });
    return OK;
  }

  /** The start-of-battle stats of a player's board units (see unitStats); [] when the preview battle cannot be built. */
  _unitStatsOf(ps) {
    const input = ps.battleInput({ side: 'L', colOffset: 0 });
    const ev = { input, kind: 'normal', round: this.round, preview: true };
    this.dispatch(ps, 'onBattleStart', ev);
    const players = [ev.input && typeof ev.input === 'object' ? ev.input : input];
    let key = null;
    try { key = JSON.stringify([this.round, this.stageId, this.battleContent, players]); } catch { key = null; }
    if (!this._unitStatsCache) this._unitStatsCache = new WeakMap(); // PlayerState → { key, units } (the last preview)
    const cached = this._unitStatsCache.get(ps);
    if (key && cached && cached.key === key) return cached.units;
    const units = [];
    // the flags of the battle it previews: a normal round gains IN_BATTLE layers from its start (a <战斗开始时> layer gain
    // raises bond stats at t = 0 there too); the Final Assault / Hidden Core fight without (previewed as a normal field)
    const bossRound = this.round === this.gd.bossRound || this.round === this.gd.hiddenRound;
    const b = this.newBattle({
      seed: deriveSeed(this.seed, `preview:${this.round}:${ps.seat}`), kind: 'normal', modeId: this.modeId, round: this.round,
      stageId: this.stageId, rect: { ...GEO.NORMAL_RECT }, timeLimit: 60, players, spawns: [], routes: this.wave ? this.wave.routes : [],
      sharedBoss: null, flags: { layerGainsEnabled: !bossRound, ...this.gd.dp, timeScale: this.gd.combatTimeScale }, fieldId: `n:${ps.playerId}`, recordEvents: false,
    });
    try {
      if (typeof b.start === 'function') b.start();
      for (const u of Array.isArray(b.allyUnits) ? b.allyUnits : []) {
        if (u && Number.isInteger(u.uid) && (u.kind === 'op' || u.kind === 'token')) units.push(unitStatsEntry(u, u.s));
      }
    } catch (e) { this.reportError('unitStats', e); }
    this._unitStatsCache.set(ps, { key, units });
    return units;
  }
}
