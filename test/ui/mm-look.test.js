// The lobby's matchmaking (野排) look, restructured after the owner's reference deployment: a THIRD mode card
// (同盟匹配 · ALLIANCE MATCHMAKING) beside 独立模拟 / 同盟模拟, and the queue UI moved from the centred `MmOverlay`
// to a bottom-right status panel (`MmPanel`, css `.mm-panel`, mint border + animated equalizer + red ✕ 退出匹配).
// This is a VISUAL restructure: the logic (`mm.join` / `mm.cancel` / `mm.state`, the shared difficulty pool, the ~30 s
// window, AI backfill, the account requirement) is untouched. The copy describes OUR rules — it must never import the
// reference's 「仅匹配真人」/「满四人后开始」 wording. Pure pieces only, no browser (see screens/lobby.js).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODE_CARDS, mmPanelView, clearMmQueue, roomEntryPolicy, fmtMmClock } from '../../public/js/screens/lobby.js';
import { store } from '../../public/js/store.js';
import { MAX_SEATS, DIFFICULTIES, MM_WINDOW_MS } from '../../shared/constants.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('lobby mode row: the third card is the 野排 matchmaker', () => {
  test('three cards, in order: 独立模拟 · 同盟模拟 · 同盟匹配', () => {
    assert.deepEqual(MODE_CARDS.map((c) => c.id), ['solo', 'coop', 'mm']);
    assert.deepEqual(MODE_CARDS.map((c) => c.name), ['独立模拟', '同盟模拟', '同盟匹配']);
    assert.deepEqual(MODE_CARDS.map((c) => c.en), ['SOLO SIMULATION', 'ALLIANCE SIMULATION', 'ALLIANCE MATCHMAKING']);
  });

  test('the 同盟匹配 card carries the reference look: a waveform icon, a description and two ◆ bullets', () => {
    const mm = MODE_CARDS.find((c) => c.id === 'mm');
    assert.equal(mm.icon, 'signal', 'the mint waveform / bars glyph');
    assert.equal(typeof mm.desc, 'string');
    assert.ok(mm.desc.length > 0);
    assert.equal(mm.points.length, 2, 'two bullets, like the reference');
    assert.ok(mm.points.every((p) => typeof p === 'string' && p.length > 0));
    // every mode card follows the same shape (icon + en label + name + desc + 2 bullets)
    for (const c of MODE_CARDS) {
      assert.ok(c.icon && c.en === c.en.toUpperCase(), `${c.id}: icon + uppercase en label`);
      assert.equal(c.points.length, 2, `${c.id}: two bullets`);
    }
  });

  test('the 野排 bullets describe OUR rules (shared pool / AI backfill), never the reference wording', () => {
    const mm = MODE_CARDS.find((c) => c.id === 'mm');
    const copy = [mm.desc, ...mm.points].join(' ');
    assert.match(copy, /共享池/, 'our shared pool');
    assert.match(copy, /AI/, 'our AI backfill');
    // the reference's wording must not be imported
    for (const bad of ['仅匹配真人', '仅匹配真实朋友', '满四人后开始', '满 4 人后开始']) {
      assert.ok(!copy.includes(bad), `no reference wording: ${bad}`);
      assert.ok(!src('public/js/screens/lobby.js').includes(bad), `lobby source free of: ${bad}`);
    }
  });
});

describe('野排 status panel: queued / un-queued view model', () => {
  test('not queued → nothing to render', () => {
    assert.equal(mmPanelView(null), null);
    assert.equal(mmPanelView({}), null);
    assert.equal(mmPanelView({ queued: false, difficulty: 'HARD', waiting: 2 }), null);
  });

  test('queued → the live mm.state numbers, with 4 seats and sane defaults', () => {
    const now = 1_000_000;
    const v = mmPanelView({ queued: true, difficulty: 'HARD', waiting: 2, need: 4, elapsedMs: 12_400, deadlineMs: now + 18_000 }, now);
    assert.deepEqual(v, { difficulty: 'HARD', waiting: 2, need: 4, elapsed: 12, left: 18 });
    // a minimal payload (the server's own defaults): 0 waiting, MAX_SEATS needed, no deadline
    assert.deepEqual(mmPanelView({ queued: true }, now), { difficulty: null, waiting: 0, need: MAX_SEATS, elapsed: 0, left: 0 });
    assert.equal(MAX_SEATS, 4, 'the panel shows n/4');
    // a past deadline clamps to 0 (no negative countdown); a difficulty is only kept as a string
    assert.equal(mmPanelView({ queued: true, deadlineMs: now - 5_000 }, now).left, 0);
    assert.equal(mmPanelView({ queued: true, difficulty: 7 }, now).difficulty, null);
  });
});

describe('野排 cancel path', () => {
  test('clearMmQueue drops the queue and the bucket difficulty (optimistic; mm.state re-syncs)', () => {
    store.patch('mm', { queued: true, difficulty: 'ABYSS', waiting: 3, elapsedMs: 9000 });
    assert.equal(store.get().mm.queued, true);
    clearMmQueue();
    assert.equal(store.get().mm.queued, false);
    assert.equal(store.get().mm.difficulty, null);
    // the panel's view model follows: nothing to render once cleared
    assert.equal(mmPanelView(store.get().mm), null);
  });
});

describe('lobby wiring: the panel replaced the centred overlay', () => {
  test('the panel renders only while queued and wires the cancel; the mode card selects the matchmaker', () => {
    const lobby = src('public/js/screens/lobby.js');
    assert.ok(!/html`<\$\{MmOverlay\}/.test(lobby) && !lobby.includes('mm-overlay '), 'the old centred MmOverlay is no longer rendered');
    assert.ok(/MmPanel\b/.test(lobby) && lobby.includes('class="mm-panel brackets"'), 'the bottom-right MmPanel is rendered');
    assert.ok(/\$\{mm\.queued \? html`<\$\{MmPanel\}/.test(lobby), 'mounted from mm.queued');
    assert.ok(lobby.includes('onCancel=${mmCancel}'), 'the cancel path is wired to mm.cancel');
    assert.ok(lobby.includes("net.request('mm.cancel')"), 'mm.cancel still goes to the server');
    // the third card is part of MODE_CARDS (rendered by the mode-cards grid), and 同盟匹配 selects the mm action
    assert.ok(/roomMode === 'mm'/.test(lobby), 'the lobby branches on the matchmaking mode');
    assert.ok(lobby.includes("title=${auth.account ? '' : t('需要先登录账号')}"), 'a 野排 action still requires an account');
    assert.ok(lobby.includes("t('搜寻队友（野排）')"), 'the same 野排 action the old button offered');
  });
});

describe('panel styles: mint bracket panel with the equalizer and the red ✕ 退出匹配', () => {
  test('the css carries the panel, the animated equalizer and the red-bordered exit', () => {
    const css = src('public/css/screens/lobby.css');
    assert.ok(/\.mm-panel\s*\{/.test(css), 'panel rule');
    assert.ok(/\.mm-panel\s*\{[^}]*border:\s*1px solid var\(--mint-a35\)/.test(css), 'mint border');
    assert.ok(/\.mm-eq i\s*\{[^}]*animation:\s*mm-eq/.test(css) && /@keyframes mm-eq/.test(css), 'animated equalizer');
    assert.ok(/\.mm-panel \.mm-panel__exit\s*\{[^}]*--btn-bd:\s*var\(--red\)/.test(css), 'red-bordered exit button');
    // the mode row grew to three equal cards
    assert.ok(/\.mode-cards\s*\{[^}]*grid-template-columns:\s*repeat\(3, 1fr\)/.test(css), 'three mode cards in a row');
    // the old overlay style is gone
    assert.ok(!css.includes('.mm-overlay'), 'no leftover overlay styles');
  });
});

describe('matching blocks the create-room action (owner 2026-10-11: 匹配的时候不要让其创建房间)', () => {
  test('blocked while queued — for every room mode; allowed otherwise', () => {
    const queued = { queued: true, difficulty: 'HARD' };
    for (const mode of ['solo', 'coop', 'mm']) assert.equal(roomEntryPolicy(queued, mode).blocked, true, `queued + ${mode}`);
    assert.equal(roomEntryPolicy({ queued: false }, 'coop').blocked, false);
    assert.equal(roomEntryPolicy(null, 'solo').blocked, false);
    assert.equal(roomEntryPolicy({}, 'coop').blocked, false);
  });

  test('the 同盟匹配 mode itself never creates a room', () => {
    const p = roomEntryPolicy({ queued: false }, 'mm');
    assert.equal(p.blocked, true);
    assert.equal(p.reason, '同盟匹配不会创建房间');
    assert.equal(roomEntryPolicy({ queued: false }, 'coop').reason, '', 'no reason when the create action is allowed');
  });

  test('the queued reason wins and names the way out (退出匹配)', () => {
    const p = roomEntryPolicy({ queued: true }, 'coop');
    assert.equal(p.reason, '匹配中不可创建房间，请先退出匹配');
    assert.match(p.reason, /退出匹配/);
  });

  test('clearMmQueue (the panel\'s 退出匹配) re-enables create at once', () => {
    store.patch('mm', { queued: true, difficulty: 'HARD' });
    assert.equal(roomEntryPolicy(store.get().mm, 'coop').blocked, true);
    clearMmQueue();
    assert.equal(roomEntryPolicy(store.get().mm, 'coop').blocked, false);
    assert.equal(roomEntryPolicy(store.get().mm, 'coop').reason, '');
  });

  test('lobby wiring: entryPolicy drives the create button + a visible hint, and the handler guards too', () => {
    const lobby = src('public/js/screens/lobby.js');
    assert.ok(lobby.includes('const entryPolicy = roomEntryPolicy(mm, roomMode);'), 'recomputed per render, so a mode switch cannot leave a stale button');
    assert.ok(lobby.includes('disabled=${!online || entryPolicy.blocked}'), 'the create button is disabled while blocked');
    assert.ok(lobby.includes('text=${entryPolicy.reason ||'), 'the reason rides the tooltip');
    assert.ok(lobby.includes('<span class="create-box__blocked">'), 'and a visible hint, not only the tooltip');
    assert.ok(lobby.includes('if (entryPolicy.blocked) { if (entryPolicy.reason) toast(entryPolicy.reason'), 'a keyboard / stale click is refused too');
    assert.equal((lobby.match(/entryPolicy\.blocked/g) || []).length, 2, 'only the create button and its handler use blocked');
  });
});

describe('join-by-key while queued: ALLOWED, and entering a room leaves the pool', () => {
  test('the policy keeps 加入同盟 / 观战 enabled and flags the queue clear', () => {
    // the chosen behaviour (matches the server: room.join / room.spectate → mm.leave, a queued player is dropped):
    // join is never blocked; it cancels the queue instead. A FAILED join must keep the queue.
    assert.equal(roomEntryPolicy({ queued: true }, 'coop').joinClearsQueue, true);
    assert.equal(roomEntryPolicy({ queued: false }, 'coop').joinClearsQueue, false);
  });

  test('lobby wiring: neither join button is disabled by the queue; both clear the local queue on SUCCESS', () => {
    const lobby = src('public/js/screens/lobby.js');
    assert.ok(lobby.includes('disabled=${!codeOk || !online} onClick=${() => join()}'), '加入同盟 keeps its own guard');
    assert.ok(lobby.includes('disabled=${!codeOk || !online} onClick=${spectate}'), '观战 keeps its own guard');
    assert.equal((lobby.match(/if \(entryPolicy\.joinClearsQueue\) clearMmQueue\(\);/g) || []).length, 2, 'join and spectate both clear on success');
    assert.ok(/net\.request\('room\.join', \{ code: k \}\)\.then\(\(r\) => \{[\s\S]*?if \(entryPolicy\.joinClearsQueue\) clearMmQueue\(\)/.test(lobby), 'a failed join (the .catch) keeps the queue');
    assert.ok(/net\.request\('room\.spectate', \{ code: k \}\)\.then\(\(r\) => \{[\s\S]*?if \(entryPolicy\.joinClearsQueue\) clearMmQueue\(\)/.test(lobby), 'a failed spectate keeps the queue');
  });
});

describe('the 野排 window is up to 5 minutes, and the panel formats it', () => {
  test('MM_WINDOW_MS is 300 000 ms', () => {
    assert.equal(MM_WINDOW_MS, 300_000);
  });

  test('fmtMmClock: seconds below a minute, m:ss from a minute up', () => {
    assert.equal(fmtMmClock(0), '0s');
    assert.equal(fmtMmClock(45), '45s');
    assert.equal(fmtMmClock(59), '59s');
    assert.equal(fmtMmClock(60), '1:00');
    assert.equal(fmtMmClock(295), '4:55');
    assert.equal(fmtMmClock(MM_WINDOW_MS / 1000), '5:00');
    assert.equal(fmtMmClock(-5), '0s');
    assert.equal(fmtMmClock(undefined), '0s');
  });

  test('the panel / mode card carry the 5-minute copy and use the clock', () => {
    const lobby = src('public/js/screens/lobby.js');
    assert.ok(lobby.includes('${fmtMmClock(v.elapsed)}'), '已等待 uses the clock');
    assert.ok(lobby.includes("t('约 {left} 后由 AI 补位开局', { left: fmtMmClock(v.left) })"), 'countdown uses the clock');
    assert.ok(lobby.includes("t('进入共享池，最多 5 分钟凑齐 4 人，不足由 AI 补位')"), 'panel / mm-box hint');
    assert.ok(MODE_CARDS.find((c) => c.id === 'mm').points.some((p) => p.includes('最多 5 分钟')), 'the mode card bullet');
    assert.ok(!lobby.includes('最多 30 秒'), 'no 30 s copy left in the lobby');
  });

  test('the view model still reports raw seconds: the clock governs the format', () => {
    const now = 1_000_000;
    const v = mmPanelView({ queued: true, difficulty: 'HARD', waiting: 1, need: 4, elapsedMs: 12_000, deadlineMs: now + MM_WINDOW_MS }, now);
    assert.equal(v.elapsed, 12);
    assert.equal(v.left, 300);
    assert.equal(fmtMmClock(v.left), '5:00');
  });
});

describe('difficulty selection is unchanged for the matchmaker', () => {
  test('the mm mode uses the co-op difficulty texts (the pool is difficulty-bucketed)', () => {
    const lobby = src('public/js/screens/lobby.js');
    assert.ok(lobby.includes("roomMode === 'mm' ? 'coop' : roomMode"), 'mm falls back to the co-op mode id for difficultyInfo');
    assert.ok(DIFFICULTIES.length === 4, 'the four difficulty cards stay');
  });
});
