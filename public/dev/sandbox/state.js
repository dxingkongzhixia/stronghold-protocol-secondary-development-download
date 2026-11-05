// public/dev/sandbox/state.js — the admin sandbox's scenario: its URL form, its spawn groups, and the BattleSpec they
// build (server/sim/spec.js). Pure (no DOM, no fetch) so test/dev/sandbox.test.js can run it in Node.
//
// Legacy parameters (docs/DEV-SANDBOX.md): ?unit= &s= &stage= &wave= &mix=1 &elite=0 &hp= &speed= — every old link keeps
// working. New: ?p= 潜能 1–6, ?cul= 练度 0–3, ?mod= 模组, ?row= &col= &dir=, ?atk=, ?seed=, ?nofoe=1, and ?e= packs the
// spawn groups as `key:count:interval:time:route:hp:atk;…` (the operator's own dummy stream is the default).

export const SPEEDS = Object.freeze([1, 2, 4, 8]);
export const DIRS = Object.freeze(['UP', 'RIGHT', 'DOWN', 'LEFT']);
export const SLOTS = Object.freeze({ normal: 'chess_char_6_diy1_a', elite: 'chess_char_6_diy1_b' });
export const DIFFICULTIES = Object.freeze(['FUNNY', 'NORMAL', 'HARD', 'ABYSS']);

export const DEFAULT_STATE = Object.freeze({
  unit: 'char_4247_oxi',
  skill: 2,
  elite: true,
  potential: 6,
  cultivate: 0,
  module: null,
  row: null,
  col: null,
  dir: 'RIGHT',
  stage: 'act1autochess_m01',
  wave: 'act1autochess_05',
  mix: false,
  groups: [],
  boss: null,
  bossDifficulty: 'NORMAL',
  bossHpMul: 1,
  team: [],
  hp: 6,
  atk: 1,
  speed: 2,
  seed: 20261103,
  foes: true,
});

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const int = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : d;
};
const num = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : d;
};
const id = (v, d) => (typeof v === 'string' && ID.test(v) ? v : d);

/** One spawn group (the panel's rows) — a key, how many, how often, from when, down which route, and stat multipliers. */
export function cleanGroup(g) {
  if (!g || typeof g !== 'object') return null;
  const key = id(g.key, null);
  if (!key) return null;
  return {
    key,
    count: int(g.count, 1, 50, 1),
    interval: num(g.interval, 0, 60, 2),
    time: num(g.time, 0, 600, 2),
    route: int(g.route, 0, 15, 0),
    hp: num(g.hp, 0.1, 100, 1),
    atk: num(g.atk, 0.1, 100, 1),
  };
}

/** `key:count:interval:time:route:hp:atk` joined by `;` — the `?e=` form. */
export function groupsToParam(groups) {
  return (Array.isArray(groups) ? groups : [])
    .map((g) => { const c = cleanGroup(g); return c ? `${c.key}:${c.count}:${c.interval}:${c.time}:${c.route}:${c.hp}:${c.atk}` : null; })
    .filter(Boolean)
    .join(';');
}

/** Parse `?e=`; malformed entries are dropped (never a half group). */
export function parseGroups(s) {
  if (typeof s !== 'string' || !s) return [];
  return s.split(';').flatMap((part) => {
    const f = part.split(':');
    if (f.length < 2) return [];
    const g = cleanGroup({ key: f[0], count: f[1], interval: f[2], time: f[3], route: f[4], hp: f[5], atk: f[6] });
    return g ? [g] : [];
  }).slice(0, 16);
}

/** One extra team member (up to 3): the DIY pick plus an optional explicit tile. */
export function cleanMember(m) {
  if (!m || typeof m !== 'object') return null;
  const unit = id(m.unit, null);
  if (!unit) return null;
  return {
    unit,
    skill: int(m.skill, 0, 9, 0),
    row: m.row == null ? null : int(m.row, 0, 40, null),
    col: m.col == null ? null : int(m.col, 0, 40, null),
    dir: DIRS.includes(m.dir) ? m.dir : 'RIGHT',
  };
}

/** `unit:skill:row:col:dir` joined by `;` — the `?team=` form (row/col may be empty). */
export function teamToParam(team) {
  return (Array.isArray(team) ? team : []).slice(0, 3)
    .map((m) => { const c = cleanMember(m); return c ? `${c.unit}:${c.skill}:${c.row ?? ''}:${c.col ?? ''}:${c.dir}` : null; })
    .filter(Boolean).join(';');
}

export function parseTeam(s) {
  if (typeof s !== 'string' || !s) return [];
  return s.split(';').flatMap((part) => {
    const f = part.split(':');
    if (f.length < 2) return [];
    const m = cleanMember({ unit: f[0], skill: f[1], row: f[2] || null, col: f[3] || null, dir: f[4] });
    return m ? [m] : [];
  }).slice(0, 3);
}

/** The scenario named by a query string (`location.search`), with every value clamped to what the sim accepts. */
export function stateFromQuery(search) {
  const q = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const has = (k) => q.has(k);
  return {
    unit: id(q.get('unit'), DEFAULT_STATE.unit),
    skill: int(q.get('s'), 0, 9, DEFAULT_STATE.skill),
    elite: q.get('elite') !== '0',
    potential: int(q.get('p'), 1, 6, DEFAULT_STATE.potential),
    cultivate: int(q.get('cul'), 0, 3, DEFAULT_STATE.cultivate),
    module: q.get('mod') && ID.test(q.get('mod')) ? q.get('mod') : null,
    row: has('row') ? int(q.get('row'), 0, 40, null) : null,
    col: has('col') ? int(q.get('col'), 0, 40, null) : null,
    dir: DIRS.includes(q.get('dir')) ? q.get('dir') : DEFAULT_STATE.dir,
    stage: id(q.get('stage'), DEFAULT_STATE.stage),
    wave: id(q.get('wave'), DEFAULT_STATE.wave),
    mix: q.get('mix') === '1',
    groups: parseGroups(q.get('e')),
    boss: q.get('boss') && ID.test(q.get('boss')) ? q.get('boss') : null,
    bossDifficulty: DIFFICULTIES.includes(q.get('bd')) ? q.get('bd') : DEFAULT_STATE.bossDifficulty,
    bossHpMul: num(q.get('bhp'), 0.001, 100, DEFAULT_STATE.bossHpMul),
    team: parseTeam(q.get('team')),
    hp: num(q.get('hp'), 0.1, 100, DEFAULT_STATE.hp),
    atk: num(q.get('atk'), 0.1, 100, DEFAULT_STATE.atk),
    speed: SPEEDS.includes(Number(q.get('speed'))) ? Number(q.get('speed')) : DEFAULT_STATE.speed,
    seed: int(q.get('seed'), 1, 2 ** 31 - 1, DEFAULT_STATE.seed),
    foes: q.get('nofoe') !== '1',
  };
}

/** The query string of a scenario (defaults omitted; the identity fields are always kept). */
export function stateToQuery(state) {
  const s = { ...DEFAULT_STATE, ...state };
  const q = new URLSearchParams();
  q.set('unit', s.unit);
  q.set('s', String(s.skill));
  q.set('stage', s.stage);
  q.set('wave', s.wave);
  if (!s.elite) q.set('elite', '0');
  if (s.potential !== DEFAULT_STATE.potential) q.set('p', String(s.potential));
  if (s.cultivate) q.set('cul', String(s.cultivate));
  if (s.module) q.set('mod', s.module);
  if (s.row != null && s.col != null) { q.set('row', String(s.row)); q.set('col', String(s.col)); }
  if (s.dir !== DEFAULT_STATE.dir) q.set('dir', s.dir);
  if (s.mix) q.set('mix', '1');
  if (s.groups.length) q.set('e', groupsToParam(s.groups));
  if (s.boss) {
    q.set('boss', s.boss);
    if (s.bossDifficulty !== DEFAULT_STATE.bossDifficulty) q.set('bd', s.bossDifficulty);
    if (s.bossHpMul !== DEFAULT_STATE.bossHpMul) q.set('bhp', String(s.bossHpMul));
  }
  if (s.team?.length) q.set('team', teamToParam(s.team));
  if (s.hp !== DEFAULT_STATE.hp) q.set('hp', String(s.hp));
  if (s.atk !== DEFAULT_STATE.atk) q.set('atk', String(s.atk));
  if (s.speed !== DEFAULT_STATE.speed) q.set('speed', String(s.speed));
  if (s.seed !== DEFAULT_STATE.seed) q.set('seed', String(s.seed));
  if (!s.foes) q.set('nofoe', '1');
  return q.toString();
}

/** The wave template (data/waves.json) as the battle's own `spawns` entries (spawns.js `_queueSpawn`). */
export function waveSpawns(tpl) {
  return (tpl?.spawns ?? []).map((s) => ({
    enemyKey: s.enemyKey ?? s.key,
    time: Number(s.time ?? s.t) || 0,
    routeIndex: Number(s.routeIndex ?? s.route) || 0,
    count: Math.max(1, Number(s.count ?? s.n) || 1),
    interval: Math.max(0, Number(s.interval ?? s.int) || 0),
    // a boss wave tags its leader: BOSS_KITS attach by tag/defId (server/sim/content/bosses.js) and the engine routes
    // its damage into the shared pool only for a tagged leader
    ...(s.tag ? { tag: s.tag } : {}),
    ...(s.mods ? { mods: s.mods } : {}),
    ...(s.unharmful ? { unharmful: true } : {}),
  }));
}

/** A legal deploy tile of the stage, or the wave's walking lane: where the DIY piece stands when the scenario has none. */
export function autoPlace(stage, routes = []) {
  const walkRows = new Set(routes.filter((r) => (r?.motion ?? 'WALK') === 'WALK').map((r) => r?.start?.[0]).filter((r) => r != null));
  const tiles = [...(stage?.deployTiles?.normal?.melee ?? []), ...(stage?.deployTiles?.normal?.ranged ?? [])];
  const lane = tiles.filter(([r]) => walkRows.has(r));
  const pool = lane.length ? lane : tiles;
  const mid = 6; // the p1 half runs cols 2..10; the gate is the right end
  return pool.slice().sort((a, b) => Math.abs(a[1] - mid) - Math.abs(b[1] - mid) || a[0] - b[0])[0] ?? [10, 6];
}

/**
 * Build the BattleSpec of the scenario.
 * @param {object} state stateFromQuery's shape (any subset)
 * @param {{ stages?: Record<string, object>, waves?: Record<string, object>, enemies?: Record<string, object>, bosses?: Record<string, object> }} ctx
 *   the loaded data files (data.get('stages') / ('waves') / ('enemies') / ('bosses')); Maps are accepted too
 * @returns {object} a JSON-safe spec for createBattleFromSpec
 */
export function buildSpec(state, { stages = {}, waves = {}, enemies = {}, bosses = {} } = {}) {
  const s = { ...DEFAULT_STATE, ...state };
  const pick = (m, k) => (m instanceof Map ? m.get(k) : m?.[k]) ?? null;
  const stage = pick(stages, s.stage);
  let wave = pick(waves, s.wave);
  const boss = s.boss ? pick(bosses, s.boss) : null;
  if (boss && !wave) {
    const key = `mode_multi_${String(s.bossDifficulty).toLowerCase()}`;
    const tplId = boss.templates?.[key]?.template ?? Object.values(boss.templates ?? {})[0]?.template;
    wave = tplId ? pick(waves, tplId) : null;
  }
  if (!stage) throw new Error(`unknown stage ${s.stage}`);
  if (!wave) throw new Error(`unknown wave template ${s.wave}`);
  const routes = wave.routes ?? [];
  const [row, col] = s.row != null && s.col != null ? [s.row, s.col] : autoPlace(stage, routes);

  // the team: the panel's operator first, then up to three extras on nearby legal tiles
  const used = new Set([`${row},${col}`]);
  const legal = [...new Set([...(stage?.deployTiles?.normal?.melee ?? []), ...(stage?.deployTiles?.normal?.ranged ?? [])]
    .map(([r, c]) => `${r},${c}`))].map((k) => k.split(',').map(Number));
  const nextTile = () => {
    const free = legal.filter(([r, c]) => !used.has(`${r},${c}`))
      .sort((a, b) => (Math.abs(a[0] - row) + Math.abs(a[1] - col)) - (Math.abs(b[0] - row) + Math.abs(b[1] - col)));
    const t = free[0] ?? [row, col];
    used.add(`${t[0]},${t[1]}`);
    return t;
  };
  const unitOf = (m, uid, at) => ({
    uid,
    chessId: s.elite ? SLOTS.elite : SLOTS.normal,
    diy: { charId: m.unit, skillIndex: m.skill, ...(m.module ? { uniEquipId: m.module } : {}) },
    row: m.row ?? at[0],
    col: m.col ?? at[1],
    dir: m.dir || 'RIGHT',
    potential: m.potential ?? 6,
    cultivate: m.cultivate ?? 0,
  });
  const units = [unitOf({ unit: s.unit, skill: s.skill, module: s.module, row, col, dir: s.dir, potential: s.potential, cultivate: s.cultivate }, 1, [row, col])];
  for (const m of (s.team ?? []).slice(0, 3)) {
    const c = cleanMember(m);
    if (c) units.push(unitOf(c, units.length + 1, nextTile()));
  }

  const baseSpawns = !s.foes ? [] : s.groups.length
    ? s.groups.map((g) => {
      const c = cleanGroup(g);
      return { enemyKey: c.key, time: c.time, routeIndex: c.route, count: c.count, interval: c.interval };
    })
    : s.mix || boss
      ? waveSpawns(wave)
      : (() => {
        const walkers = [...new Set((wave.spawns ?? [])
          .filter((x) => (routes[x.routeIndex]?.motion ?? 'WALK') !== 'FLY')
          .map((x) => x.enemyKey ?? x.key))];
        const lane = routes.findIndex((r) => (r?.motion ?? 'WALK') === 'WALK' && r?.start?.[0] === row);
        return walkers.length
          ? [{ enemyKey: walkers[0], time: 2, routeIndex: Math.max(0, lane), count: 18, interval: 2.4 }]
          : waveSpawns(wave);
      })();
  // the boss leader itself is a spawn of its own enemyKey: BOSS_KITS attach by defId (server/sim/content/bosses.js).
  // A boss wave already carries it with tag 'boss' — do not spawn a second, untagged copy.
  const leaderInWave = (wave.spawns ?? []).some((x) => (x.enemyKey ?? x.key) === boss?.enemyKey && x.tag === 'boss');
  const leader = boss && s.foes && !leaderInWave
    ? [{ enemyKey: boss.enemyKey, time: 2, routeIndex: 0, count: 1, interval: 0, tag: 'boss' }]
    : [];
  const spawns = [...leader, ...baseSpawns];

  // per-enemy stat overrides: the scenario's global multipliers, then a group's own (same key twice: the first wins)
  const overrides = {};
  const seen = new Set();
  const apply = (key, hpMul, atkMul) => {
    const d = enemies[key];
    if (!d?.stats || seen.has(key)) return;
    seen.add(key);
    const stats = {};
    if (Number(d.stats.maxHp) > 0 && hpMul !== 1) stats.maxHp = Math.round(d.stats.maxHp * hpMul);
    if (Number(d.stats.atk) > 0 && atkMul !== 1) stats.atk = Math.round(d.stats.atk * atkMul);
    if (Object.keys(stats).length) overrides[key] = { stats };
  };
  if (s.groups.length) {
    for (const g of s.groups) { const c = cleanGroup(g); if (c) apply(c.key, s.hp * c.hp, s.atk * c.atk); }
  } else {
    for (const sp of spawns) apply(sp.enemyKey, s.hp, s.atk);
  }

  // the shared boss pool: the difficulty's blood points, shrunk by the panel's multiplier (a workbench fight must be
  // reachable in seconds, not the 675k of a real round)
  let bossSpec = null;
  if (boss) {
    const base = Number(boss.bloodPoint?.[s.bossDifficulty]) || Number(Object.values(boss.bloodPoint ?? {})[0]) || 500000;
    const poolHp = Math.max(1, Math.round(base * s.bossHpMul));
    bossSpec = { poolHp, poolMax: poolHp };
  }

  return {
    fieldId: 'sandbox',
    seed: s.seed,
    kind: boss ? 'boss' : 'normal',
    round: 1,
    stageId: s.stage,
    waveId: wave.id ?? s.wave,
    timeLimit: boss ? null : Number(wave.maxPlayTime) || 60,
    players: [{ playerId: 'p1', side: 'L', units }],
    routes,
    spawns,
    enemyOverrides: overrides,
    ...(boss ? { bossId: boss.bossId, boss: bossSpec } : {}),
    // the battle-start operation cooldown would hold the piece back 3 s; the sandbox wants the skill on screen at once
    flags: { startOpCooldown: 0 },
  };
}
