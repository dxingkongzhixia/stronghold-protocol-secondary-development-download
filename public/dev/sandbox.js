// public/dev/sandbox.js — the admin sandbox (/admin/sandbox?token=…): a scenario panel over ONE real battle.
//
// Not a recording: the page runs the client's own simulation (public/js/battle/runner.js loadBrowserSim → /sim, the same
// code the match ships) and feeds its snapshots / events into the battlefield renderer (render/app.js) exactly as the
// game screen receives them. Change the panel — operator, skill, potential, module, tile, enemies, map, wave — and the
// battle is rebuilt on the spot; the address bar always carries the scenario (state.js), so a link is a bug report.
//
// Parameters (legacy ones keep working): see public/dev/sandbox/state.js and docs/DEV-SANDBOX.md.
import { createFieldView } from '../js/render/app.js';
import { data } from '../js/data.js';
import { assets } from '../js/assets.js';
import { audio, installAudio } from '../js/audio.js';
import { GEO } from '../../shared/constants.js';
import { TICK } from '/sim/constants.js';
import { loadBrowserSim } from '../js/battle/runner.js';
import { buildSpec, stateFromQuery, stateToQuery } from './sandbox/state.js';
import { createPanel } from './sandbox/panels.js';

const $ = (id) => document.getElementById(id);
const quiet = { warn() {}, error() {}, info() {}, debug() {} };
const FIELD_ID = 'sandbox';

let view = null, sim = null, battle = null, playing = false, speed = 2, acc = 0, last = 0;
let casts = 0, damage = 0, bursts = 0, spawned = 0, endsAt = 0;
let state = stateFromQuery(location.search);
let panel = null;
let stages = null, waves = null, enemies = null;

const setText = (id, s) => { const el = $(id); if (el && el.textContent !== s) el.textContent = s; };
const fail = (err) => { panel?.error(err); console.error(err); };

/** The operator/enemy/stage/wave catalogs the panel lists (built once from the loaded data files). */
function buildCatalogs() {
  // 干员: data/backups.json `diy.operators` is the game's 自选 roster (91 bodies) — most of them are NOT in
  // data/chess.json, so the old chess-charId list would have hidden 82 of them. Skills and modules live in the unit's
  // forms: use the most advanced form for the descriptions (levels do not change the ids).
  const backups = data.get('backups') || {};
  const diy = backups.diy || {};
  const formsOf = (unit) => Object.values(unit?.forms || {});
  const advanced = (forms) => forms.slice().sort((a, b) => (b?.status?.phase ?? 0) - (a?.status?.phase ?? 0)
    || (b?.status?.level ?? 0) - (a?.status?.level ?? 0) || (b?.status?.skillLevel ?? 0) - (a?.status?.skillLevel ?? 0))[0];
  const operators = Object.entries(diy.operators || {}).map(([charId, meta]) => {
    const unit = backups.units?.[charId] || {};
    const forms = formsOf(unit);
    const best = advanced(forms);
    const skills = (best?.skills ?? []).filter((s) => s && Number.isInteger(s.index)).sort((a, b) => a.index - b.index);
    const modules = [];
    for (const f of forms) for (const m of f?.modules ?? []) if (m?.uniEquipId && !modules.some((x) => x.id === m.uniEquipId)) modules.push({ id: m.uniEquipId, name: m.name || m.uniEquipId });
    return { charId, name: meta?.name || unit.name || charId, rarity: meta?.rarity ?? unit.rarity, profession: meta?.profession ?? unit.profession, position: unit.position, skills, modules };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN'));
  const en = Object.entries(data.get('enemies') || {}).map(([key, e]) => ({
    key, name: e?.name || key, rank: e?.rank ?? '', maxHp: e?.stats?.maxHp ?? 0, atk: e?.stats?.atk ?? 0, isFly: !!e?.isFlyEnemy,
  })).sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN'));
  const st = Object.entries(data.get('stages') || {}).map(([id, s]) => ({ id, name: s?.name || id, size: s?.size, deployTiles: s?.deployTiles })).sort((a, b) => a.id.localeCompare(b.id));
  const wv = Object.entries(data.get('waves') || {}).map(([id, w]) => ({ id, kind: w?.kind, bossId: w?.bossId ?? null, maxPlayTime: w?.maxPlayTime, routes: w?.routes })).sort((a, b) => a.id.localeCompare(b.id));
  return { operators, enemies: en, stages: st, waves: wv };
}

/** One client frame: the drained events, then the snapshot they belong to (20 Hz: every 3rd tick). */
function feed() {
  const ev = battle.drainEvents() || [];
  for (const e of ev) {
    if (e[0] === 'dmg') damage += Number(e[2]) || 0;
    else if (e[0] === 'skill' && Number(e[2]) === 1) casts++;
    else if (e[0] === 'spawn' && e[1]?.side === 'enemy') spawned++;
    else if (e[0] === 'fx' && e[1] === 'burst' && e[4]?.element === 'burn') bursts++;
  }
  const snap = battle.snapshot();
  if (ev.length) {
    view.pushEvents({ t: 'b.ev', fieldId: FIELD_ID, gt: snap.t, ev });
    // the game screen's own audio path (screens/game.js): cast / impact / death / deploy cues from the same tuples
    audio.handleBattleEvents(ev);
  }
  view.pushSnapshot(snap);
  return snap;
}

function stats() {
  const foes = (battle?.enemies ?? []).filter((e) => e.side === 'enemy' && e.alive).length;
  setText('sbCasts', String(casts));
  setText('sbDamage', Math.round(damage).toLocaleString('zh-CN'));
  setText('sbEnemies', String(foes));
  setText('sbKills', String(Math.max(0, spawned - foes)));
  setText('sbBursts', String(bursts));
  setText('sbAudio', audio.unlocked ? '已开启 🔊' : '未开启 · 点一下页面');
  const gauge = (battle?.enemies ?? []).reduce((m, e) => Math.max(m, e.side === 'enemy' ? Math.round(e.elem?.burn ?? 0) : 0), 0);
  setText('sbBurn', String(gauge));
  setText('sbTime', `${(battle?.time ?? 0).toFixed(1)} / ${(battle?.timeLimit ?? 0) === Infinity ? '∞' : battle?.timeLimit ?? 0} s`);
}

/** Build the battle of the current scenario and hand it to the renderer. */
async function start() {
  const spec = buildSpec(state, { stages, waves, enemies });
  const stage = stages[state.stage];
  battle = sim.spec.createBattleFromSpec(spec, sim.ds, { logger: quiet });
  casts = 0; damage = 0; bursts = 0; spawned = 0; acc = 0; endsAt = 0;
  $('sbResult').textContent = '';
  const meta = battle.fieldMeta();
  const rect = meta.rect ?? GEO.NORMAL_RECT;
  view.setStage(stage);
  view.enterBattle({ t: 'm.field', ...meta, fieldId: FIELD_ID, kind: 'normal', rect, stageId: state.stage, players: ['p1'], local: true, speed });
  view.setCamera('normal', { rect, side: 'L', instant: true });
  // one step so the operator is deployed, then the opening frame (the match sends b.ev before b.snap of the same drain)
  battle.step();
  const hero = battle.units.find((u) => u.kind === 'op' && u.side === 'ally');
  setText('sbUnit', `${hero?.name || state.unit}${hero?.name ? ` · ${state.unit}` : ''}`);
  setText('sbSkill', `${state.skill === 0 ? 'S1' : state.skill === 1 ? 'S2' : `S${state.skill + 1}`} · ${hero?.skill?.id ?? '—'}`);
  last = performance.now();
  feed();
  stats();
}

/** Persist the scenario in the address bar (shareable; the page's whole state). */
function writeUrl() {
  const qs = stateToQuery(state);
  const url = `${location.pathname}?${qs}`;
  if (location.pathname + location.search !== url) history.replaceState(null, '', url);
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
  n = Math.min(n, 240); // a long stall does not fast-forward half a battle in one frame
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

/** Advance one second while paused (the step button): the same ticks a second of playback would run. */
function stepSecond() {
  if (!battle || battle.finished) return;
  const n = Math.round(1 / TICK);
  for (let i = 0; i < n && !battle.finished; i++) {
    battle.step();
    if (battle.tickCount % 3 === 0) feed();
  }
  stats();
  if (battle.finished) $('sbResult').textContent = `战斗结束 · ${battle.result?.()?.reason ?? 'finished'}`;
}

/** Click the battlefield to move the DIY piece to that tile (the panel's grid does the same without aiming). */
function wireBoardClick() {
  const field = $('field');
  field.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !view || !battle) return;
    const ground = view.debug?.pick?.groundTile;
    if (typeof ground !== 'function') return;
    const rect = field.getBoundingClientRect();
    const t = ground(e.clientX - rect.left, e.clientY - rect.top);
    if (!t) return;
    const legal = new Set([...(stages[state.stage]?.deployTiles?.normal?.melee ?? []), ...(stages[state.stage]?.deployTiles?.normal?.ranged ?? [])]
      .map(([r, c]) => `${r},${c}`));
    if (!legal.has(`${t.row},${t.col}`)) return;
    panel.set({ row: t.row, col: t.col });
  });
}

async function main() {
  await data.loadAll('chess', 'backups', 'tokens', 'items', 'enemies', 'stages', 'bonds', 'config', 'waves', 'assets');
  installAudio({ getManifest: () => data.get('assets'), settings: { bgm: 0, sfx: 0.8, voice: 0.8, muted: false } });
  await assets.ready();
  view = await createFieldView($('field'), { data, assets, settings: { quality: 'high', damageNumbers: true } });
  window.__view = view; // the dev pages' hook (render-demo): the fx library / wiring are under view.debug
  window.__audio = audio; // dev hook: unlock state, the manifest entry, the cues it played
  sim = await loadBrowserSim();
  stages = data.get('stages') || {};
  waves = data.get('waves') || {};
  enemies = data.get('enemies') || {};
  const catalogs = buildCatalogs();

  // a link may name an operator / stage / wave this build no longer has: fall back instead of failing the first battle
  const opById = new Map(catalogs.operators.map((o) => [o.charId, o]));
  const firstOp = catalogs.operators[0];
  if (!opById.has(state.unit) && firstOp) state = { ...state, unit: firstOp.charId };
  const skills = (opById.get(state.unit)?.skills ?? []).map((s) => s.index);
  if (skills.length && !skills.includes(state.skill)) state = { ...state, skill: skills.filter((i) => i <= state.skill).pop() ?? skills[0] };
  if (state.module && !(opById.get(state.unit)?.modules ?? []).some((m) => m.id === state.module)) state = { ...state, module: null };
  if (!stages[state.stage]) state = { ...state, stage: catalogs.stages[0]?.id ?? state.stage };
  if (!waves[state.wave]) state = { ...state, wave: catalogs.waves[0]?.id ?? state.wave };
  writeUrl();

  // the battle is NOT built yet: a browser creates the AudioContext only on a gesture, and the audio manager drops every
  // event (units' spawns included) until then — starting before the click left the operator untracked and silent.
  playing = false;
  panel = createPanel({
    root: $('sbPanel'),
    catalogs,
    initial: state,
    onChange(next, { rebuild }) {
      state = next;
      writeUrl();
      if (rebuild) start().catch(fail);
    },
  });

  // controls
  $('sbPlay').onclick = () => {
    playing = !playing;
    $('sbPlay').textContent = playing ? '▌▌ 暂停' : '▶ 继续';
    last = performance.now();
  };
  $('sbStep').onclick = () => { playing = false; $('sbPlay').textContent = '▶ 继续'; stepSecond(); };
  $('sbRestart').onclick = () => { playing = true; $('sbPlay').textContent = '▌▌ 暂停'; start().catch(fail); };
  for (const b of document.querySelectorAll('[data-speed]')) {
    b.classList.toggle('is-on', Number(b.dataset.speed) === state.speed);
    b.onclick = () => {
      state = { ...state, speed: Number(b.dataset.speed) || 1 };
      speed = state.speed;
      writeUrl();
      for (const x of document.querySelectorAll('[data-speed]')) x.classList.toggle('is-on', x === b);
    };
  }
  $('sbCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); setText('sbCopy', '✓ 已复制'); }
    catch { setText('sbCopy', location.href); }
    setTimeout(() => setText('sbCopy', '🔗 复制链接'), 1500);
  };
  speed = state.speed;

  const startBtn = $('sbStartBtn');
  if (startBtn) startBtn.onclick = () => {
    audio._unlock?.();
    $('sbStart')?.remove();
    playing = true;
    $('sbPlay').textContent = '▌▌ 暂停';
    start().catch(fail); // builds the battle with audio already live, so its spawns are tracked
  };
  wireBoardClick();
  last = performance.now();
  requestAnimationFrame(frame);
  window.__sandbox = {
    get battle() { return battle; }, get casts() { return casts; }, get damage() { return damage; }, get state() { return state; },
    start, stepSecond, panel,
  };
}

main().catch(fail);
