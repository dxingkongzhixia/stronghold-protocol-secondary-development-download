// Generic band-grant contract (PRTS design, docs/PRTS-SOURCE-CODE.md §3.4 / §6). A content plugin writes these fields
// on a band record; the match/sim read them through this module. Pure: validation, defaults, problems only.

/** [ASSUMED] bounds. */
export const BAND_GRANT_LIMITS = Object.freeze({
  bonds: 8,
  bondId: 64,
  reviveMs: 600000,
  maxRevives: 10,
  restLayers: 10,
  restRandomCount: 4,
  /** A rest grant may name at most this many rounds; round numbers run 1..roundMax. */
  restRounds: 24,
  roundMax: 99,
  eliteOthers: 6,
});

const ID = /^[A-Za-z0-9_]{1,64}$/;
/**
 * @param {unknown} v
 * @returns {v is Record<string, any>}
 */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const int = (v, lo, hi, path, problems, fallback = null) => {
  if (!Number.isInteger(v) || v < lo || v > hi) { problems.push(`${path}: expected an integer in ${lo}..${hi}`); return fallback; }
  return v;
};
const bool = (v, path, problems, fallback = false) => {
  if (v === undefined) return fallback;
  if (typeof v !== 'boolean') { problems.push(`${path}: expected true or false`); return fallback; }
  return v;
};

/**
 * Read one band record's grant fields.
 * @param {unknown} raw
 * @returns {{ grants: any|null, problems: string[] }}
 */
export function readBandGrants(raw) {
  const problems = [];
  if (raw === undefined || raw === null) return { grants: null, problems };
  if (!isObj(raw)) return { grants: null, problems: ['grants: expected an object'] };
  for (const k of Object.keys(raw)) if (!['grantUnit', 'eliteGate', 'restEndBondLayers', 'restEndRandomChess', 'team'].includes(k)) problems.push(`grants: unknown field "${k}"`);
  const g = { team: bool(raw.team, 'grants.team', problems, true) };

  if (raw.grantUnit !== undefined) {
    const u = raw.grantUnit;
    if (!isObj(u)) problems.push('grants.grantUnit: expected an object');
    else {
      const allowed = ['charId', 'tier', 'elite', 'skill', 'skillLocked', 'bonds', 'token', 'tokenOnDeath', 'reviveMs', 'maxRevives', 'placement'];
      for (const k of Object.keys(u)) if (!allowed.includes(k)) problems.push(`grants.grantUnit: unknown field "${k}"`);
      const out = {};
      if (typeof u.charId !== 'string' || !ID.test(u.charId)) problems.push('grants.grantUnit.charId: expected a char id');
      else out.charId = u.charId;
      out.tier = int(u.tier ?? 3, 1, 6, 'grants.grantUnit.tier', problems, 3);
      out.elite = bool(u.elite, 'grants.grantUnit.elite', problems, false);
      out.skill = int(u.skill ?? 0, 0, 2, 'grants.grantUnit.skill', problems, 0);
      out.skillLocked = bool(u.skillLocked, 'grants.grantUnit.skillLocked', problems, false);
      if (u.bonds !== undefined) {
        if (!Array.isArray(u.bonds) || u.bonds.length > BAND_GRANT_LIMITS.bonds || !u.bonds.every((b) => typeof b === 'string' && ID.test(b))) {
          problems.push(`grants.grantUnit.bonds: expected at most ${BAND_GRANT_LIMITS.bonds} bond ids`);
        } else out.bonds = [...new Set(u.bonds)];
      }
      if (u.token !== undefined) {
        if (typeof u.token !== 'string' || !ID.test(u.token)) problems.push('grants.grantUnit.token: expected a token id');
        else out.token = u.token;
      }
      out.tokenOnDeath = u.tokenOnDeath === undefined ? 'remove' : u.tokenOnDeath;
      if (!['remove', 'downed'].includes(out.tokenOnDeath)) problems.push('grants.grantUnit.tokenOnDeath: expected "remove" or "downed"');
      out.reviveMs = int(u.reviveMs ?? 20000, 0, BAND_GRANT_LIMITS.reviveMs, 'grants.grantUnit.reviveMs', problems, 20000);
      out.maxRevives = int(u.maxRevives ?? 2, 0, BAND_GRANT_LIMITS.maxRevives, 'grants.grantUnit.maxRevives', problems, 2);
      out.placement = u.placement === undefined ? 'hand' : u.placement;
      if (!['hand', 'amedicSlot'].includes(out.placement)) problems.push('grants.grantUnit.placement: expected "hand" or "amedicSlot"');
      g.grantUnit = out;
    }
  }

  if (raw.eliteGate !== undefined) {
    const e = raw.eliteGate;
    if (!isObj(e)) problems.push('grants.eliteGate: expected an object');
    else {
      for (const k of Object.keys(e)) if (!['others', 'at'].includes(k)) problems.push(`grants.eliteGate: unknown field "${k}"`);
      const at = e.at ?? 'battleStart';
      if (at !== 'battleStart') problems.push('grants.eliteGate.at: only "battleStart" is supported');
      g.eliteGate = { others: int(e.others ?? 2, 1, BAND_GRANT_LIMITS.eliteOthers, 'grants.eliteGate.others', problems, 2), at: 'battleStart' };
    }
  }

  if (raw.restEndBondLayers !== undefined) {
    const r = raw.restEndBondLayers;
    if (!isObj(r)) problems.push('grants.restEndBondLayers: expected an object');
    else {
      for (const k of Object.keys(r)) if (!['scope', 'layers', 'activeOnly', 'cap'].includes(k)) problems.push(`grants.restEndBondLayers: unknown field "${k}"`);
      if (r.scope !== undefined && r.scope !== 'self') problems.push('grants.restEndBondLayers.scope: only "self" is supported');
      const cap = r.cap ?? 'maxCount';
      if (!['maxCount', 'none'].includes(cap)) problems.push('grants.restEndBondLayers.cap: expected "maxCount" or "none"');
      g.restEndBondLayers = {
        scope: 'self',
        layers: int(r.layers ?? 3, 1, BAND_GRANT_LIMITS.restLayers, 'grants.restEndBondLayers.layers', problems, 3),
        activeOnly: bool(r.activeOnly, 'grants.restEndBondLayers.activeOnly', problems, true),
        cap,
      };
    }
  }

  if (raw.restEndRandomChess !== undefined) {
    const r = raw.restEndRandomChess;
    if (!isObj(r)) problems.push('grants.restEndRandomChess: expected an object');
    else {
      for (const k of Object.keys(r)) if (!['minTier', 'maxTier', 'count', 'rounds', 'maxTierByRound'].includes(k)) problems.push(`grants.restEndRandomChess: unknown field "${k}"`);
      const minTier = int(r.minTier ?? 1, 1, 6, 'grants.restEndRandomChess.minTier', problems, 1);
      const maxTier = int(r.maxTier ?? 4, 1, 6, 'grants.restEndRandomChess.maxTier', problems, 4);
      if (minTier !== null && maxTier !== null && minTier > maxTier) problems.push('grants.restEndRandomChess: minTier must not exceed maxTier');
      const out = {
        minTier,
        maxTier,
        count: int(r.count ?? 1, 1, BAND_GRANT_LIMITS.restRandomCount, 'grants.restEndRandomChess.count', problems, 1),
      };
      if (r.rounds !== undefined) {
        if (!Array.isArray(r.rounds) || r.rounds.length === 0 || r.rounds.length > BAND_GRANT_LIMITS.restRounds) {
          problems.push(`grants.restEndRandomChess.rounds: expected 1..${BAND_GRANT_LIMITS.restRounds} round numbers`);
        } else {
          const rounds = [];
          for (const v of r.rounds) {
            if (!Number.isInteger(v) || v < 1 || v > BAND_GRANT_LIMITS.roundMax) {
              problems.push(`grants.restEndRandomChess.rounds: expected integers in 1..${BAND_GRANT_LIMITS.roundMax}`);
              rounds.length = 0;
              break;
            }
            rounds.push(v);
          }
          if (rounds.length) out.rounds = [...new Set(rounds)].sort((a, b) => a - b);
        }
      }
      if (r.maxTierByRound !== undefined) {
        if (!isObj(r.maxTierByRound)) problems.push('grants.restEndRandomChess.maxTierByRound: expected an object');
        else {
          const keys = Object.keys(r.maxTierByRound);
          if (keys.length > BAND_GRANT_LIMITS.restRounds) problems.push(`grants.restEndRandomChess.maxTierByRound: at most ${BAND_GRANT_LIMITS.restRounds} rounds`);
          const caps = {};
          for (const k of keys) {
            const round = Number(k);
            if (!/^\d+$/.test(k) || !Number.isInteger(round) || round < 1 || round > BAND_GRANT_LIMITS.roundMax) {
              problems.push(`grants.restEndRandomChess.maxTierByRound: "${k}" is not a round number`);
              continue;
            }
            const tier = int(r.maxTierByRound[k], 1, 6, `grants.restEndRandomChess.maxTierByRound.${k}`, problems, null);
            if (tier === null) continue;
            if (minTier !== null && tier < minTier) {
              problems.push(`grants.restEndRandomChess.maxTierByRound.${k}: must not be below minTier`);
              continue;
            }
            if (out.rounds && !out.rounds.includes(round)) {
              problems.push(`grants.restEndRandomChess.maxTierByRound.${k}: round is not listed in rounds`);
              continue;
            }
            caps[round] = tier;
          }
          out.maxTierByRound = caps;
        }
      }
      g.restEndRandomChess = out;
    }
  }

  return { grants: problems.length || !['grantUnit', 'eliteGate', 'restEndBondLayers', 'restEndRandomChess'].some((k) => raw[k] !== undefined) ? null : g, problems };
}
