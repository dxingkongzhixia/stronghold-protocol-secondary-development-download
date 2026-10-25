// Generic boss protocol contract (PRTS design, docs/PRTS-SOURCE-CODE.md §3). Content plugins write these fields on
// an enemy/boss record; the sim and the match read them through this module instead of hard-coding a boss name.
//
// The module is pure: it validates, applies defaults and reports problems. It never mutates the record and never
// touches gameplay. Runtime hooks consume `readBossProtocol(...).protocol`.


/** [ASSUMED] bounds: above every official boss and far below values that can stall a battle. */
export const BOSS_PROTOCOL_LIMITS = Object.freeze({
  linkId: 64,
  reviveCount: 10,
  reviveAtk: 10000,
  reviveDown: 60,
  shortenSeconds: 10,
  shortenMin: 30,
  clearAt: 600,
  clearWarning: 60,
  clearLp: 30,
  clearExtend: 300,
  dpMultiplier: 5,
  dpDuration: 60,
  lockCount: 12,
  lockDuration: 60,
  projectileCooldown: 120,
  projectileScale: 20,
  flyDuration: 60,
  flyTargets: 4,
  flyRange: 10,
  beamInterval: 120,
  beamTargets: 8,
  beamScale: 5,
  beamWidth: 3,
  beamWindup: 10,
  shieldRatio: 5,
});

const ID = /^[A-Za-z0-9_]{1,64}$/;
const PLUGIN_ID = /^[a-z0-9][a-z0-9-]{1,31}$/;
const KEYS = new Set(['link', 'revive', 'clearProtocol', 'dpRegen', 'deployLock', 'projectile', 'fly', 'beam', 'ui']);
const UI_TEXT = Object.freeze({ revives: 'Revive', clear: 'Clear Protocol', down: 'Reviving', cleared: 'Protocol executed', shield: 'Shield' });
/**
 * @param {unknown} v
 * @returns {v is Record<string, any>}
 */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const int = (v, lo, hi, path, problems, fallback = null) => {
  if (!Number.isInteger(v) || v < lo || v > hi) { problems.push(`${path}: expected an integer in ${lo}..${hi}`); return fallback; }
  return v;
};
const num = (v, lo, hi, path, problems, fallback = null) => {
  if (!Number.isFinite(v) || v < lo || v > hi) { problems.push(`${path}: expected a number in ${lo}..${hi}`); return fallback; }
  return v;
};
const bool = (v, path, problems, fallback = false) => {
  if (v === undefined) return fallback;
  if (typeof v !== 'boolean') { problems.push(`${path}: expected true or false`); return fallback; }
  return v;
};
const pair = (v, lo, hi, path, problems) => {
  if (!Array.isArray(v) || v.length !== 2) { problems.push(`${path}: expected [min, max]`); return null; }
  const min = num(v[0], lo, hi, `${path}[0]`, problems);
  const max = num(v[1], lo, hi, `${path}[1]`, problems);
  if (min === null || max === null) return null;
  return [min, max];
};

/**
 * Read one enemy/boss record's protocol fields.
 * @param {unknown} raw
 * @returns {{ protocol: any|null, problems: string[] }}
 */
export function readBossProtocol(raw) {
  const problems = [];
  if (raw === undefined || raw === null) return { protocol: null, problems };
  if (!isObj(raw)) return { protocol: null, problems: ['protocol: expected an object'] };
  for (const k of Object.keys(raw)) if (!KEYS.has(k)) problems.push(`protocol: unknown field "${k}"`);
  const p = {};

  if (raw.link !== undefined) {
    const l = raw.link;
    if (!isObj(l)) problems.push('protocol.link: expected an object');
    else {
      for (const k of Object.keys(l)) if (!['enemy', 'guard', 'shieldRatio'].includes(k)) problems.push(`protocol.link: unknown field "${k}"`);
      if (typeof l.enemy !== 'string' || !ID.test(l.enemy)) problems.push('protocol.link.enemy: expected an enemy id');
      else {
        p.link = { enemy: l.enemy, guard: bool(l.guard, 'protocol.link.guard', problems, true) };
        if (l.shieldRatio !== undefined) {
          p.link.shieldRatio = num(l.shieldRatio, 0, BOSS_PROTOCOL_LIMITS.shieldRatio, 'protocol.link.shieldRatio', problems, 0);
        }
      }
    }
  }

  if (raw.revive !== undefined) {
    const r = raw.revive;
    if (!isObj(r)) problems.push('protocol.revive: expected an object');
    else {
      for (const k of Object.keys(r)) if (!['count', 'atk', 'hpReset', 'down', 'shortenOnHit'].includes(k)) problems.push(`protocol.revive: unknown field "${k}"`);
      const count = int(r.count, 0, BOSS_PROTOCOL_LIMITS.reviveCount, 'protocol.revive.count', problems);
      const atk = num(r.atk ?? 0, 0, BOSS_PROTOCOL_LIMITS.reviveAtk, 'protocol.revive.atk', problems, 0);
      const out = {
        count: count ?? 0,
        atk: atk ?? 0,
        hpReset: bool(r.hpReset, 'protocol.revive.hpReset', problems, true),
        down: num(r.down ?? 8, 1, BOSS_PROTOCOL_LIMITS.reviveDown, 'protocol.revive.down', problems, 8),
      };
      if (r.shortenOnHit !== undefined) {
        const s = r.shortenOnHit;
        if (!isObj(s)) problems.push('protocol.revive.shortenOnHit: expected an object');
        else {
          for (const k of Object.keys(s)) if (!['target', 'seconds', 'min'].includes(k)) problems.push(`protocol.revive.shortenOnHit: unknown field "${k}"`);
          const target = s.target ?? 'boss';
          if (target !== 'boss') problems.push('protocol.revive.shortenOnHit.target: expected "boss"');
          out.shortenOnHit = {
            target,
            seconds: num(s.seconds ?? 1, 0, BOSS_PROTOCOL_LIMITS.shortenSeconds, 'protocol.revive.shortenOnHit.seconds', problems, 1),
            min: num(s.min ?? 0, 0, BOSS_PROTOCOL_LIMITS.shortenMin, 'protocol.revive.shortenOnHit.min', problems, 0),
          };
        }
      }
      p.revive = out;
    }
  }

  if (raw.clearProtocol !== undefined) {
    const c = raw.clearProtocol;
    if (!isObj(c)) problems.push('protocol.clearProtocol: expected an object');
    else {
      for (const k of Object.keys(c)) if (!['at', 'warning', 'lp', 'hiddenAt', 'hiddenLp', 'extendPerRevive'].includes(k)) problems.push(`protocol.clearProtocol: unknown field "${k}"`);
      const out = {
        at: num(c.at ?? 90, 10, BOSS_PROTOCOL_LIMITS.clearAt, 'protocol.clearProtocol.at', problems, 90),
        warning: num(c.warning ?? 10, 0, BOSS_PROTOCOL_LIMITS.clearWarning, 'protocol.clearProtocol.warning', problems, 10),
        lp: int(c.lp ?? 10, 1, BOSS_PROTOCOL_LIMITS.clearLp, 'protocol.clearProtocol.lp', problems, 10),
        // each revive the boss goes through buys the team this many seconds: the protocol punishes stalling, not progress
        extendPerRevive: num(c.extendPerRevive ?? 0, 0, BOSS_PROTOCOL_LIMITS.clearExtend, 'protocol.clearProtocol.extendPerRevive', problems, 0),
      };
      if (c.hiddenAt !== undefined) out.hiddenAt = num(c.hiddenAt, 10, BOSS_PROTOCOL_LIMITS.clearAt, 'protocol.clearProtocol.hiddenAt', problems, out.at);
      if (c.hiddenLp !== undefined) out.hiddenLp = int(c.hiddenLp, 1, BOSS_PROTOCOL_LIMITS.clearLp, 'protocol.clearProtocol.hiddenLp', problems, out.lp);
      p.clearProtocol = out;
    }
  }

  if (raw.dpRegen !== undefined) {
    const d = raw.dpRegen;
    if (!isObj(d)) problems.push('protocol.dpRegen: expected an object');
    else {
      for (const k of Object.keys(d)) if (!['multiplier', 'duration'].includes(k)) problems.push(`protocol.dpRegen: unknown field "${k}"`);
      p.dpRegen = {
        multiplier: num(d.multiplier ?? 3, 1, BOSS_PROTOCOL_LIMITS.dpMultiplier, 'protocol.dpRegen.multiplier', problems, 3),
        duration: num(d.duration ?? 10, 0, BOSS_PROTOCOL_LIMITS.dpDuration, 'protocol.dpRegen.duration', problems, 10),
      };
    }
  }

  if (raw.deployLock !== undefined) {
    const d = raw.deployLock;
    if (!isObj(d)) problems.push('protocol.deployLock: expected an object');
    else {
      for (const k of Object.keys(d)) if (!['count', 'duration', 'afterRevive'].includes(k)) problems.push(`protocol.deployLock: unknown field "${k}"`);
      const out = {
        count: int(d.count ?? 4, 1, BOSS_PROTOCOL_LIMITS.lockCount, 'protocol.deployLock.count', problems, 4),
        duration: num(d.duration ?? 10, 1, BOSS_PROTOCOL_LIMITS.lockDuration, 'protocol.deployLock.duration', problems, 10),
      };
      if (d.afterRevive !== undefined) {
        const a = d.afterRevive;
        if (!isObj(a)) problems.push('protocol.deployLock.afterRevive: expected an object');
        else out.afterRevive = {
          count: int(a.count ?? 6, 1, BOSS_PROTOCOL_LIMITS.lockCount, 'protocol.deployLock.afterRevive.count', problems, 6),
          duration: num(a.duration ?? 15, 1, BOSS_PROTOCOL_LIMITS.lockDuration, 'protocol.deployLock.afterRevive.duration', problems, 15),
        };
      }
      p.deployLock = out;
    }
  }

  if (raw.projectile !== undefined) {
    const q = raw.projectile;
    if (!isObj(q)) problems.push('protocol.projectile: expected an object');
    else {
      for (const k of Object.keys(q)) if (!['cooldown', 'damage', 'radius'].includes(k)) problems.push(`protocol.projectile: unknown field "${k}"`);
      p.projectile = {
        cooldown: num(q.cooldown ?? 12, 1, BOSS_PROTOCOL_LIMITS.projectileCooldown, 'protocol.projectile.cooldown', problems, 12),
        damage: pair(q.damage ?? [2.4, 1], 0, BOSS_PROTOCOL_LIMITS.projectileScale, 'protocol.projectile.damage', problems),
        radius: pair(q.radius ?? [1.5, 0.45], 0, BOSS_PROTOCOL_LIMITS.flyRange, 'protocol.projectile.radius', problems),
      };
    }
  }

  if (raw.fly !== undefined) {
    const f = raw.fly;
    if (!isObj(f)) problems.push('protocol.fly: expected an object');
    else {
      for (const k of Object.keys(f)) if (!['duration', 'targets', 'range', 'intervalDelta', 'hpLoss', 'knockDownDamage'].includes(k)) problems.push(`protocol.fly: unknown field "${k}"`);
      p.fly = {
        duration: num(f.duration ?? 25, 1, BOSS_PROTOCOL_LIMITS.flyDuration, 'protocol.fly.duration', problems, 25),
        targets: int(f.targets ?? 2, 1, BOSS_PROTOCOL_LIMITS.flyTargets, 'protocol.fly.targets', problems, 2),
        range: num(f.range ?? 3.5, 0, BOSS_PROTOCOL_LIMITS.flyRange, 'protocol.fly.range', problems, 3.5),
        intervalDelta: num(f.intervalDelta ?? -0.5, -5, 0, 'protocol.fly.intervalDelta', problems, -0.5),
        hpLoss: num(f.hpLoss ?? 0.3, 0, 1, 'protocol.fly.hpLoss', problems, 0.3),
        knockDownDamage: num(f.knockDownDamage ?? 0.15, 0, 1, 'protocol.fly.knockDownDamage', problems, 0.15),
      };
    }
  }

  if (raw.beam !== undefined) {
    const b = raw.beam;
    if (!isObj(b)) problems.push('protocol.beam: expected an object');
    else {
      for (const k of Object.keys(b)) if (!['interval', 'targets', 'damageScale', 'width', 'windup', 'interruptHp'].includes(k)) problems.push(`protocol.beam: unknown field "${k}"`);
      p.beam = {
        interval: num(b.interval ?? 30, 1, BOSS_PROTOCOL_LIMITS.beamInterval, 'protocol.beam.interval', problems, 30),
        targets: int(b.targets ?? 3, 1, BOSS_PROTOCOL_LIMITS.beamTargets, 'protocol.beam.targets', problems, 3),
        damageScale: num(b.damageScale ?? 0.5, 0, BOSS_PROTOCOL_LIMITS.beamScale, 'protocol.beam.damageScale', problems, 0.5),
        width: num(b.width ?? 1, 1, BOSS_PROTOCOL_LIMITS.beamWidth, 'protocol.beam.width', problems, 1),
        windup: num(b.windup ?? 3, 0, BOSS_PROTOCOL_LIMITS.beamWindup, 'protocol.beam.windup', problems, 3),
        interruptHp: num(b.interruptHp ?? 0.15, 0, 1, 'protocol.beam.interruptHp', problems, 0.15),
      };
    }
  }

  if (raw.ui !== undefined) {
    const u = raw.ui;
    if (!isObj(u)) problems.push('protocol.ui: expected an object');
    else {
      for (const k of Object.keys(u)) if (!['id', 'slot', 'revivesLabel', 'clearLabel', 'downLabel', 'clearedLabel', 'shieldLabel'].includes(k)) problems.push(`protocol.ui: unknown field "${k}"`);
      const id = typeof u.id === 'string' ? u.id : '';
      if (!PLUGIN_ID.test(id)) problems.push('protocol.ui.id: expected a plugin id');
      else {
        const text = (v, fallback, key) => {
          if (v === undefined) return fallback;
          if (typeof v !== 'string' || !v.trim() || [...v].length > 40) { problems.push(`protocol.ui.${key}: expected a text of 1..40 characters`); return fallback; }
          return v.trim();
        };
        p.ui = {
          id,
          slot: u.slot === 'overlay' ? 'overlay' : 'boss',
          revivesLabel: text(u.revivesLabel, UI_TEXT.revives, 'revivesLabel'),
          clearLabel: text(u.clearLabel, UI_TEXT.clear, 'clearLabel'),
          downLabel: text(u.downLabel, UI_TEXT.down, 'downLabel'),
          clearedLabel: text(u.clearedLabel, UI_TEXT.cleared, 'clearedLabel'),
          shieldLabel: text(u.shieldLabel, UI_TEXT.shield, 'shieldLabel'),
        };
      }
    }
  }

  return { protocol: problems.length || !Object.keys(p).length ? null : p, problems };
}
