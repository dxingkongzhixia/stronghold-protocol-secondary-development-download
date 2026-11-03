// public/dev/sandbox.js — the admin sandbox (/admin/sandbox?token=…): ONE operator, ONE skill, a real battle.
//
// Not a recording: the page runs the client's own simulation (public/js/battle/runner.js loadBrowserSim → /sim, the same
// code the match ships) and feeds its snapshots / events into the battlefield renderer (render/app.js) exactly as the
// game screen receives them. So a kit change in server/sim/** shows up here with its real damage, waves and FX — the
// thing a fixed effect prefab demo cannot show.
//
//   ?unit=<charId>      the operator of the DIY piece (default 塔露拉 char_4247_oxi)
//   ?s=<0|1|2>          skill index (default 2 = S3)
//   ?stage=<stageId>    the board (default act1autochess_m01)
//   ?wave=<waveId>      the wave template its routes / enemies come from (default act1autochess_05)
//   ?mix=1              spawn the whole template (default: a steady stream of its walkers down her lane)
//   ?elite=0            field the normal form (E1) instead of the elite (default elite, E2 Lv60)
//   ?speed=<1|2|4>      playback speed (default 2)
//
// The operator is fielded on a melee tile of a walking lane (when the stage has one), facing the enemy gate, so the lane
// the skill sweeps has enemies coming down it. The panel's numbers are read off the sim: casts = the 'skill' tuples,
// damage = the 'dmg' tuples.
import { createFieldView } from '../js/render/app.js';
import { data } from '../js/data.js';
import { assets } from '../js/assets.js';
import { GEO } from '../../shared/constants.js';
import { TICK } from '/sim/constants.js';
import { loadBrowserSim } from '../js/battle/runner.js';

const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const UNIT = /^[A-Za-z0-9_]+$/.test(q.get('unit') || '') ? q.get('unit') : 'char_4247_oxi';
const SKILL = Math.max(0, Math.min(2, Number(q.get('s') ?? 2) || 0));
const STAGE = /^[A-Za-z0-9_]+$/.test(q.get('stage') || '') ? q.get('stage') : 'act1autochess_m01';
const WAVE = /^[A-Za-z0-9_]+$/.test(q.get('wave') || '') ? q.get('wave') : 'act1autochess_05';
const SPEED0 = [1, 2, 4].includes(Number(q.get('speed'))) ? Number(q.get('speed')) : 2;
const FIELD_ID = 'sandbox';
// the 6★ DIY slot the 2026-11-01 additions are fielded through; `?elite=0` fields the normal form (E1) for comparison
const SLOT = q.get('elite') === '0' ? 'chess_char_6_diy1_a' : 'chess_char_6_diy1_b';

/** The melee tile of a walking lane closest to the lane's middle: enemies come down that row past her. */
function pickTile(stage, routes) {
  const walkRows = new Set(routes.filter((r) => (r?.motion ?? 'WALK') === 'WALK').map((r) => r?.start?.[0]).filter((r) => r != null));
  const melee = stage?.deployTiles?.normal?.melee ?? [];
  const lane = melee.filter(([r]) => walkRows.has(r));
  const pool = lane.length ? lane : melee;
  const mid = 6; // the p1 half runs cols 2..10; the gate is the right end
  return pool.slice().sort((a, b) => Math.abs(a[1] - mid) - Math.abs(b[1] - mid) || a[0] - b[0])[0] ?? [10, 6];
}

/** The wave template (data/waves.json) as the battle's own `spawns` entries (spawns.js `_queueSpawn`). */
const spawnsOf = (tpl) => (tpl?.spawns ?? []).map((s) => ({
  enemyKey: s.enemyKey ?? s.key, time: Number(s.time ?? s.t) || 0, routeIndex: Number(s.routeIndex ?? s.route) || 0,
  count: Math.max(1, Number(s.count ?? s.n) || 1), interval: Math.max(0, Number(s.interval ?? s.int) || 0),
}));

let view = null, sim = null, battle = null, playing = true, speed = SPEED0, acc = 0, last = 0;
let casts = 0, damage = 0, endsAt = 0;

const setText = (id, s) => { const el = $(id); if (el && el.textContent !== s) el.textContent = s; };
const fail = (err) => { $('sbError').textContent = String(err?.stack || err?.message || err); console.error(err); };

async function start() {
  const stage = data.lookup('stages', STAGE);
  const wave = sim.ds.getWave?.(WAVE) ?? data.lookup('waves', WAVE);
  if (!stage) throw new Error(`unknown stage ${STAGE}`);
  if (!wave) throw new Error(`unknown wave template ${WAVE}`);
  const routes = wave.routes ?? [];
  const [row, col] = pickTile(stage, routes);
  // the wave that walks HER lane (route order = the template's); `?mix=1` spawns the whole template instead of the stream
  const laneRoute = routes.findIndex((r) => (r?.motion ?? 'WALK') === 'WALK' && r?.start?.[0] === row);
  const walkers = [...new Set((wave.spawns ?? []).filter((s) => (routes[s.routeIndex]?.motion ?? 'WALK') !== 'FLY').map((s) => s.enemyKey ?? s.key))];
  const spawns = q.get('mix') === '1' || !walkers.length
    ? spawnsOf(wave)
    : [{ enemyKey: walkers[0], time: 2, routeIndex: Math.max(0, laneRoute), count: 18, interval: 2.4 }];
  const spec = {
    fieldId: FIELD_ID, seed: 20261103, kind: 'normal', round: 1, stageId: STAGE,
    timeLimit: Number(wave.maxPlayTime) || 60,
    players: [{ playerId: 'p1', side: 'L', units: [{ uid: 1, chessId: SLOT, diy: { charId: UNIT, skillIndex: SKILL, uniEquipId: null }, row, col }] }],
    routes, spawns,
    // the battle-start operation cooldown would hold her back 3 s; the sandbox wants the skill on screen at once
    flags: { startOpCooldown: 0 },
  };
  battle = sim.spec.createBattleFromSpec(spec, sim.ds, { logger: { warn() {}, error() {}, info() {}, debug() {} } });
  casts = 0; damage = 0; acc = 0; endsAt = 0;
  $('sbResult').textContent = '';
  const meta = battle.fieldMeta();
  const rect = meta.rect ?? GEO.NORMAL_RECT;
  view.setStage(stage);
  view.enterBattle({ t: 'm.field', ...meta, fieldId: FIELD_ID, kind: 'normal', rect, stageId: STAGE, players: ['p1'], local: true, speed });
  view.setCamera('normal', { rect, side: 'L', instant: true });
  // one step so the operator is deployed, then the opening frame (the match sends b.ev before b.snap of the same drain)
  battle.step();
  const hero = battle.units.find((u) => u.kind === 'op' && u.side === 'ally');
  setText('sbUnit', `${hero?.name || UNIT}${hero?.name ? ` · ${UNIT}` : ''}`);
  setText('sbSkill', `${SKILL === 0 ? 'S1' : SKILL === 1 ? 'S2' : 'S3'} · ${hero?.skill?.id ?? '—'}`);
  // a restart resumes (the pause button's state follows), and the frame clock restarts with it
  playing = true;
  setText('sbPlay', '▌▌ 暂停');
  last = performance.now();
  feed();
}

/** One client frame: the drained events, then the snapshot they belong to (20 Hz: every 3rd tick). */
function feed() {
  const ev = battle.drainEvents() || [];
  for (const e of ev) {
    if (e[0] === 'dmg') damage += Number(e[2]) || 0;
    else if (e[0] === 'skill' && Number(e[2]) === 1) casts++;
  }
  const snap = battle.snapshot();
  if (ev.length) view.pushEvents({ t: 'b.ev', fieldId: FIELD_ID, gt: snap.t, ev });
  view.pushSnapshot(snap);
  return snap;
}

function stats() {
  const foes = (battle?.enemies ?? []).filter((e) => e.side === 'enemy' && e.alive).length;
  setText('sbCasts', String(casts));
  setText('sbDamage', Math.round(damage).toLocaleString('zh-CN'));
  setText('sbEnemies', String(foes));
  setText('sbTime', `${(battle?.time ?? 0).toFixed(1)} / ${(battle?.timeLimit ?? 0) === Infinity ? '∞' : battle?.timeLimit ?? 0} s`);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (!playing || !battle) return;
  if (battle.finished) {
    if (!endsAt) { endsAt = now; stats(); }
    return;
  }
  acc += dt * speed;
  let n = Math.floor(acc / TICK);
  acc -= n * TICK;
  n = Math.min(n, 120); // a long stall does not fast-forward half a battle in one frame
  for (let i = 0; i < n && !battle.finished; i++) {
    battle.step();
    if (battle.tickCount % 3 === 0) feed();
  }
  if (battle.finished) {
    feed();
    const r = battle.result?.() ?? null;
    $('sbResult').textContent = `战斗结束 · ${r?.reason ?? 'finished'}`;
  }
  stats();
}

async function main() {
  await data.loadAll('chess', 'tokens', 'items', 'enemies', 'stages', 'bonds', 'config', 'waves');
  await assets.ready();
  view = await createFieldView($('field'), { data, assets, settings: { quality: 'high', damageNumbers: true } });
  sim = await loadBrowserSim();
  await start();
  document.getElementById('sbPlay').onclick = () => {
    playing = !playing;
    $('sbPlay').textContent = playing ? '▌▌ 暂停' : '▶ 继续';
  };
  document.getElementById('sbRestart').onclick = () => start().catch(fail);
  for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => {
    speed = Number(b.dataset.speed) || 1;
    for (const x of document.querySelectorAll('[data-speed]')) x.classList.toggle('is-on', x === b);
  };
  for (const b of document.querySelectorAll('[data-speed]')) b.classList.toggle('is-on', Number(b.dataset.speed) === speed);
  last = performance.now();
  requestAnimationFrame(frame);
  window.__sandbox = { get battle() { return battle; }, get casts() { return casts; }, get damage() { return damage; }, start };
}

main().catch(fail);
