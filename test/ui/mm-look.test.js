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
import { MODE_CARDS, mmPanelView, clearMmQueue } from '../../public/js/screens/lobby.js';
import { store } from '../../public/js/store.js';
import { MAX_SEATS, DIFFICULTIES } from '../../shared/constants.js';

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

describe('difficulty selection is unchanged for the matchmaker', () => {
  test('the mm mode uses the co-op difficulty texts (the pool is difficulty-bucketed)', () => {
    const lobby = src('public/js/screens/lobby.js');
    assert.ok(lobby.includes("roomMode === 'mm' ? 'coop' : roomMode"), 'mm falls back to the co-op mode id for difficultyInfo');
    assert.ok(DIFFICULTIES.length === 4, 'the four difficulty cards stay');
  });
});
