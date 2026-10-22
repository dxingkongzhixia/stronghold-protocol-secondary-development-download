// Generic boss protocol runtime (docs/PRTS-SOURCE-CODE.md §3). Attached to a spawned enemy whose data record carries
// `protocol`; the contract lives in shared/plugins/bossProtocol.js. It implements the linked guard, the down/revive
// cycle, the clear-protocol timer, DP acceleration, the decay projectile, the first-revive fly window, the line beam
// and deploy-lock events. Effects that live outside the battle (the hand lock, match LP) consume the emitted events.
import { readBossProtocol } from '../../../shared/plugins/bossProtocol.js';
import { attach, lpLoss } from './enemies/helpers.js';
import { hypot } from '../detmath.js';

const STATE = new WeakMap();
const GUARD = 'protocol:guard';
const DOWN = 'protocol:down';
const LINK_GRACE = 5; // give up the guard when a declared link never spawns (5 s of game time)

const stateOf = (e) => e && STATE.get(e);

/** Play one of the official PRTS/mimic effect prefabs at a unit (client FxWiring.simFx 'official'). */
function protocolFx(b, unit, key, extra = {}) {
  if (!unit) return;
  // A downed linked unit still has its tile: its buff/clip effect must play even though `alive` is false
  // for the first tick of the down window.
  b.fx('plugin', { x: unit.x, y: unit.y, id: unit.id, skill: `plugin:prts-source-code:${key}`, ...extra });
}

/** Play an official prefab on a ground point (a beam's target tile). */
function protocolFxAt(b, x, y, key, extra = {}) {
  b.fx('plugin', { x, y, skill: `plugin:prts-source-code:${key}`, ...extra });
}

/** Publish the protocol's live HUD through the generic plugin view (no core PRTS branch). */
function publishProtocolView(b, st) {
  const ui = st?.protocol?.ui;
  if (!ui || typeof b.setPluginView !== 'function') return;
  const blocks = [];
  if (st.down && st.downUntil != null) {
    blocks.push({ type: 'countdown', label: ui.downLabel, seconds: Math.max(0, st.downUntil - b.time) });
  } else if (st.revivesMax > 0) {
    blocks.push({ type: 'text', label: ui.revivesLabel, text: `${st.revivesLeft}/${st.revivesMax}` });
  }
  if (st.cleared) blocks.push({ type: 'text', text: ui.clearedLabel });
  else if (st.clearAt != null) blocks.push({ type: 'countdown', label: ui.clearLabel, seconds: Math.max(0, st.clearAt - b.time) });
  const key = JSON.stringify(blocks);
  if (key === st.lastView) return;
  st.lastView = key;
  b.setPluginView(ui.id, { hud: { [ui.slot]: blocks } });
}

function addGuard(b, st) {
  if (!st.protocol.link?.guard || st.guard) return;
  b.addBuff(st.boss, { key: GUARD, flags: { untargetable: true, invulnerable: true }, persist: true, allowDead: true });
  st.guard = true;
}

function removeGuard(b, st) {
  if (!st.guard) return;
  b.removeBuff(st.boss, GUARD);
  st.guard = false;
}

function scheduleClear(b, st) {
  const c = st.protocol.clearProtocol;
  if (!c) return;
  const hidden = b.kind === 'hidden';
  const at = hidden ? (c.hiddenAt ?? c.at) : c.at;
  const lp = hidden ? (c.hiddenLp ?? c.lp) : c.lp;
  st.clearAt = b.time + at;
  if (c.warning > 0) {
    st.warningAt = b.time + Math.max(0, at - c.warning);
    st.warning = b.after(Math.max(0, at - c.warning), () => {
      if (st.dead) return;
      protocolFx(b, st.boss, 'enemy_mpprts_buff_02', { loop: true, dur: c.warning });
      b.emit('protocolWarning', { boss: st.boss, kind: 'clear', seconds: c.warning });
    });
  }
  st.clear = b.after(at, () => {
    if (st.dead) return;
    st.cleared = true;
    // "每名玩家 目标生命 -lp": the merged boss LP is one pool, so the team loses lp per player on the field.
    const players = Math.max(1, b.players?.length || 1);
    protocolFx(b, st.boss, 'enemy_mpprts_die_02');
    publishProtocolView(b, st);
    lpLoss(b, lp * players, 'clearProtocol', st.boss);
    b.emit('protocolClear', { boss: st.boss, lp, perPlayer: lp, players });
  });
}

function startDpRegen(b, st) {
  const d = st.protocol.dpRegen;
  if (!d || !(d.duration > 0) || !(b.flags.dpPerSec > 0)) return;
  const extra = Math.max(0, d.multiplier - 1) * b.flags.dpPerSec;
  if (!(extra > 0)) return;
  st.dpTimer?.cancel?.();
  const until = b.time + d.duration;
  let last = b.time;
  st.dpTimer = b.every(0.1, (battle, timer) => {
    const now = Math.min(battle.time, until);
    const dt = Math.max(0, now - last);
    last = now;
    if (dt > 0) for (const ps of battle.players) battle.addDp(ps.playerId, extra * dt);
    if (battle.time >= until - 1e-9) timer.cancel();
  }, { owner: st.boss });
  b.emit('protocolDpRegen', { boss: st.boss, multiplier: d.multiplier, duration: d.duration });
}

function fireOrb(b, st) {
  const p = st.protocol.projectile;
  const from = st.link ?? st.boss;
  if (!p || !from?.alive || !st.boss?.alive) return;
  let target = null;
  let best = Infinity;
  for (const a of b.allies()) {
    if (!a || !a.alive || a.hidden || a.s.flags.untargetable) continue;
    const d = hypot(a.x - from.x, a.y - from.y);
    if (d < best) { best = d; target = a; }
  }
  if (!target) return;
  const atk = from.s.atk;
  const start = { x: from.x, y: from.y };
  protocolFx(b, from, 'enemy_mpprts_c_trail_01');
  const dist = Math.max(0.01, hypot(target.x - start.x, target.y - start.y));
  b.addProjectile({
    from, target, speed: 8, visual: 'orb', source: from, hitDead: true,
    onHit: ({ x, y }) => {
      const k = Math.min(1, hypot(x - start.x, y - start.y) / dist);
      const dmg = atk * (p.damage[0] + (p.damage[1] - p.damage[0]) * k);
      const radius = p.radius[0] + (p.radius[1] - p.radius[0]) * k;
      for (const a of b.allies()) {
        if (!a || !a.alive || a.hidden || a.s.flags.untargetable) continue;
        if (hypot(a.x - x, a.y - y) > radius) continue;
        b.dealDamage(from, a, { amount: dmg, type: 'arts', tags: ['enemyAbility', 'protocolProjectile'] });
      }
      protocolFxAt(b, x, y, 'enemy_mpprme_skill_01_hit_01');
      protocolFxAt(b, x, y, 'enemy_mpprme_skill_01_trail_01');
      b.emit('protocolProjectile', { boss: st.boss, source: from, x, y, radius, damage: dmg });
    },
  });
  b.emit('protocolProjectileFire', { boss: st.boss, source: from, target });
}

function startProjectile(b, st) {
  const p = st.protocol.projectile;
  if (!p) return;
  st.projTimer = b.every(p.cooldown, () => fireOrb(b, st), { owner: st.boss });
}

function emitDeployLock(b, st, afterRevive) {
  const d = st.protocol.deployLock;
  const l = afterRevive ? d?.afterRevive : d;
  if (!l) return;
  protocolFx(b, st.boss, 'enemy_mpprts_buff_icon_01', { dur: l.duration });
  if (st.link) protocolFx(b, st.link, 'enemy_mpprme_buff_icon_01', { dur: l.duration });
  b.emit('protocolDeployLock', { boss: st.boss, count: l.count, duration: l.duration, afterRevive: !!afterRevive });
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1;
  const wx = px - x1, wy = py - y1;
  const vv = vx * vx + vy * vy;
  const t = vv > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv)) : 0;
  return hypot(px - (x1 + vx * t), py - (y1 + vy * t));
}

function interruptBeam(b, st) {
  if (!st.beamPending) return;
  st.beamResolve?.cancel?.();
  st.beamPending = null;
  st.beamResolve = null;
  st.beamDamage = 0;
  b.emit('protocolBeamInterrupt', { boss: st.boss, link: st.link });
}

function resolveBeam(b, st) {
  const pending = st.beamPending;
  const source = st.link;
  st.beamPending = null;
  st.beamResolve = null;
  st.beamDamage = 0;
  if (!pending || !source || !source.alive || st.dead) return;
  const p = st.protocol.beam;
  const dmg = p.damageScale * source.s.atk;
  const hit = new Set();
  for (const shot of pending) {
    protocolFxAt(b, shot.x, shot.y, 'enemy_mpprme_line_hit_01');
    protocolFxAt(b, shot.x, shot.y, 'enemy_mpprme_skill_02_hit_01');
    if (st.link) {
      protocolFx(b, st.link, 'enemy_mpprme_line_01', { toward: { x: shot.x, y: shot.y }, loop: true, dur: 0.35 });
      protocolFx(b, st.link, 'enemy_mpprme_skill_02_trail_01', { toward: { x: shot.x, y: shot.y }, loop: true, dur: 0.35 });
    }
    for (const a of b.allies()) {
      if (!a || !a.alive || a.hidden || a.s.flags.untargetable || hit.has(a)) continue;
      if (distToSegment(a.x, a.y, source.x, source.y, shot.x, shot.y) > p.width / 2) continue;
      hit.add(a);
      b.dealDamage(source, a, { amount: dmg, type: 'arts', tags: ['enemyAbility', 'protocolBeam'] });
    }
  }
  b.emit('protocolBeam', { boss: st.boss, link: source, targets: pending.length, hit: hit.size });
}

function fireBeam(b, st) {
  if (st.dead || st.down || st.beamPending || !st.link?.alive) return;
  const p = st.protocol.beam;
  const shots = b.allies()
    .filter((a) => a && a.alive && !a.hidden && !a.s.flags.untargetable)
    .sort((a, b2) => b2.hp - a.hp)
    .slice(0, p.targets)
    .map((a) => ({ target: a, x: a.x, y: a.y }));
  if (!shots.length) return;
  st.beamPending = shots;
  st.beamDamage = 0;
  protocolFx(b, st.link, 'enemy_mpprme_line_start_01', { toward: { x: shots[0].x, y: shots[0].y } });
  protocolFx(b, st.link, 'enemy_mpprme_skill_02_trail_start_01', { toward: { x: shots[0].x, y: shots[0].y } });
  b.emit('protocolBeamWindup', { boss: st.boss, link: st.link, targets: shots.length, seconds: p.windup });
  st.beamResolve = b.after(p.windup, () => resolveBeam(b, st), { owner: st.link });
}

function startBeam(b, st) {
  const p = st.protocol.beam;
  if (!p || st.beamTimer) return;
  st.beamTimer = b.every(p.interval, () => fireBeam(b, st), { owner: st.link });
}

function endFly(b, st, early) {
  const f = st.fly;
  if (!f) return;
  const unit = f.unit || st.link || st.boss;
  st.fly = null;
  f.timer?.cancel?.();
  b.removeBuff(unit, 'protocol:fly');
  if (unit.base.rangeRadius === f.range) unit.base.rangeRadius = f.origRange;
  unit.markDirty?.();
  if (early && f.knockDownDamage > 0) {
    for (const a of b.allies()) {
      if (!a || !a.alive || a.hidden || a.s.flags.untargetable) continue;
      if (hypot(a.x - unit.x, a.y - unit.y) > 1.5) continue;
      b.dealDamage(unit, a, { amount: f.knockDownDamage, type: 'arts', tags: ['enemyAbility', 'protocolFly'] });
    }
  }
  b.emit('protocolFlyEnd', { boss: st.boss, link: unit, early: !!early });
}

function startFly(b, st) {
  const p = st.protocol.fly;
  const unit = st.link;
  if (!p || st.fly || !unit?.alive || !st.boss?.alive) return;
  const baseBat = Math.max(0.1, unit.base.bat);
  const newBat = Math.max(0.1, baseBat + p.intervalDelta);
  const origRange = unit.base.rangeRadius;
  unit.base.rangeRadius = origRange + p.range;
  unit.markDirty?.();
  b.addBuff(unit, {
    key: 'protocol:fly', duration: p.duration, persist: true, visible: true,
    mods: { maxTargets: Math.max(0, p.targets - 1), batPct: newBat / baseBat - 1 },
  });
  const f = {
    unit,
    timer: b.after(p.duration, () => endFly(b, st, false), { owner: unit }),
    origRange, range: unit.base.rangeRadius,
    threshold: p.hpLoss * unit.s.maxHp, damage: 0,
    knockDownDamage: p.knockDownDamage * unit.s.atk,
  };
  st.fly = f;
  protocolFx(b, unit, 'enemy_mpprts_c_trail_01', { loop: true, dur: p.duration });
  b.emit('protocolFly', { boss: st.boss, link: unit, duration: p.duration, targets: p.targets, range: p.range });
}

function enterDown(b, st, e) {
  const p = st.protocol.revive;
  st.down = true;
  st.downUntil = b.time + p.down;
  e.hp = e.s.maxHp;
  protocolFx(b, e, 'enemy_mpprme_buff_01', { loop: true, dur: p.down });
  b.addBuff(e, { key: DOWN, flags: { untargetable: true, invulnerable: true, stun: true, noBlock: true, noMove: true }, persist: true, allowDead: true });
  removeGuard(b, st);
  interruptBeam(b, st);
  startDpRegen(b, st);
  st.timer = b.after(p.down, () => {
    if (!e.alive || st.dead) return;
    b.removeBuff(e, DOWN);
    e.hp = e.s.maxHp;
    if (p.atk) {
      e.base.atk += p.atk;
      e.s.atk += p.atk;
      e.markDirty?.();
    }
    st.down = false;
    st.downUntil = null;
    protocolFx(b, e, 'enemy_mpprme_skill_01_start_01');
    protocolFx(b, st.boss, 'enemy_mpprts_buff_01');
    addGuard(b, st);
    if (!st.revivedOnce) {
      st.revivedOnce = true;
      startBeam(b, st);
      startFly(b, st);
      emitDeployLock(b, st, true);
    }
    b.emit('protocolRevive', { boss: st.boss, link: e, left: st.revivesLeft });
  }, { owner: e });
}

/** The linked unit's ability: knocked down → down window → revive, until the count is used up. */
function linkAbility(st) {
  return {
    spawn(b, e) {
      st.link = e;
      // The mimic's own blows: its official trail / hit prefabs (the unit index is not part of the
      // --fx-keys extraction, so wire them from the protocol's link events instead).
      b.on('attack', (c) => {
        if (c.attacker !== e) return;
        protocolFx(b, e, 'enemy_mpprme_attack_trail_01');
      }, { owner: e });
      b.on('hit', (c) => {
        if (c.source !== e || !c.dmg?.isAttack || !c.target) return;
        protocolFxAt(b, c.target.x, c.target.y, 'enemy_mpprme_attack_hit_01');
      }, { owner: e });
    },
    killed(c, b, e) {
      if (st.dead || !st.boss?.alive) return false;
      if (st.down) return true; // already in its down window
      const p = st.protocol.revive;
      if (!p || st.revivesLeft <= 0) { removeGuard(b, st); return false; }
      st.revivesLeft--;
      enterDown(b, st, e);
      return true;
    },
    taken(c, b, e) {
      if (st.fly && c.amount > 0) {
        st.fly.damage += c.amount;
        if (st.fly.damage >= st.fly.threshold) endFly(b, st, true);
      }
      if (!st.beamPending || !(c.amount > 0)) return;
      st.beamDamage += c.amount;
      if (st.beamDamage >= st.protocol.beam.interruptHp * e.s.maxHp) interruptBeam(b, st);
    },
    death(c, b, e) {
      // final death: no guard any more
      if (st.link === e) {
        protocolFx(b, e, 'enemy_mpprme_die_01');
        removeGuard(b, st);
        st.beamTimer?.cancel?.();
        interruptBeam(b, st);
      }
    },
  };
}

/**
 * The boss-side ability.
 * @param {unknown} raw the record's `protocol` fields
 * @returns {object|null}
 */
/** The live HUD state of the first protocol boss on the field, or null (b.snapshot → snap.protocol). */
export function protocolSnapshot(b) {
  for (const e of b.enemies || []) {
    const st = stateOf(e);
    if (!st || st.dead) continue;
    return {
      boss: e.id,
      bossId: e.defId,
      down: !!st.down,
      downIn: st.downUntil == null ? null : Math.max(0, Math.round((st.downUntil - b.time) * 10) / 10),
      revivesLeft: st.revivesLeft,
      revivesMax: st.revivesMax,
      clearIn: st.clearAt == null ? null : Math.max(0, Math.round((st.clearAt - b.time) * 10) / 10),
      warning: st.warningAt != null && b.time >= st.warningAt,
      cleared: !!st.cleared,
    };
  }
  return null;
}

export function protocolAbility(raw) {
  const { protocol } = readBossProtocol(raw);
  if (!protocol) return null;
  return {
    spawn(b, e) {
      const st = {
        protocol, boss: e, link: null, revivesLeft: protocol.revive?.count ?? 0, revivesMax: protocol.revive?.count ?? 0, down: false,
        downUntil: null, clearAt: null, warningAt: null,
        timer: null, warning: null, clear: null, guard: false, cleared: false, dead: false, at: b.time,
        dpTimer: null, projTimer: null, beamTimer: null, beamResolve: null, beamPending: null, beamDamage: 0,
        revivedOnce: false, fly: null,
      };
      STATE.set(e, st);
      addGuard(b, st);
      scheduleClear(b, st);
      startProjectile(b, st);
      emitDeployLock(b, st, false);
      protocolFx(b, e, 'enemy_mpprts_buff_01');
      publishProtocolView(b, st);
      b.emit('protocolStart', { boss: e, protocol });
    },
    tick(b, e) {
      const st = stateOf(e);
      if (!st || st.dead) return;
      publishProtocolView(b, st);
      const linkKey = protocol.link?.enemy;
      if (!st.link && linkKey) {
        const link = (b.enemies || []).find((x) => x && x.alive && x.defId === linkKey);
        if (link) {
          st.link = link;
          attach(b, link, [linkAbility(st)]);
          if (!st.down) addGuard(b, st);
        } else if (b.time - st.at > LINK_GRACE && st.guard) {
          // a declared link that never spawned must not leave the boss untargetable forever
          removeGuard(b, st);
        }
      }
      if (st.link && !st.link.alive && !st.down) removeGuard(b, st);
    },
    taken(c, b, e) {
      const st = stateOf(e);
      if (!st) return;
      if (!st.down || !st.timer || st.timer.cancelled) return;
      const s = st.protocol.revive?.shortenOnHit;
      if (!s) return;
      const floor = b.time + (s.min ?? 0);
      st.timer.due = Math.max(floor, st.timer.due - s.seconds);
      b.emit('protocolShorten', { boss: e, seconds: s.seconds });
    },
    death(c, b, e) {
      const st = stateOf(e);
      if (!st) return;
      st.dead = true;
      protocolFx(b, e, 'enemy_mpprts_die_01');
      if (st.protocol.ui && typeof b.setPluginView === 'function') {
        b.setPluginView(st.protocol.ui.id, { hud: { [st.protocol.ui.slot]: [] } });
      }
      st.warning?.cancel?.();
      st.clear?.cancel?.();
      st.timer?.cancel?.();
      st.dpTimer?.cancel?.();
      st.projTimer?.cancel?.();
      st.beamTimer?.cancel?.();
      interruptBeam(b, st);
      if (st.fly) endFly(b, st, false);
      if (st.link?.alive) {
        if (st.down) { b.removeBuff(st.link, DOWN); st.down = false; }
        b.kill(st.link, e);
      }
      removeGuard(b, st);
    },
  };
}
