// The 设置 dialog's community entry: bug提交 (`set-bug`, the global player bug-report overlay), moved here from the
// lobby's top bar on 2026-10-11 (docs/MATCHMAKING.md §36). It is the **only** settings action besides 完成: the
// dialog's 玩法说明 (`set-guide`) and 资料库 (`set-codex`) actions were **removed on 2026-10-12** (the codex has its
// own lobby top-bar entry and the guide stays reachable in-match), so they must not come back. The 设置 gear is the
// entry to the modal on every screen. Reuses the existing msgid (bug提交), so no new i18n keys. This file checks the
// wiring without a browser; the click-through is in settings-entry.e2e.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

test('the settings dialog offers only bug提交 (set-bug) — the 玩法说明 / 资料库 actions are gone', () => {
  const s = src('public/js/ui/settings.js');
  assert.ok(s.includes('class="set-bug"') && s.includes('openBugReport') && s.includes("t('bug提交')"), 'the bug提交 action calls openBugReport');
  assert.ok(!s.includes('class="set-guide"') && !s.includes('openGuide'), 'the 玩法说明 settings action is removed');
  assert.ok(!s.includes('class="set-codex"') && !s.includes('openCodex'), 'the 资料库 settings action is removed');
  assert.ok(!s.includes("from './guide.js'") && !s.includes("from './codex.js'"), 'settings.js no longer imports the guide / codex viewers');
  assert.ok(s.includes("from './community.js'"), 'settings.js reuses the community overlay component');
});

test('the guide and the codex stay reachable where they still are (in-match guide, lobby 资料库)', () => {
  const match = src('public/js/ui/matchChrome.js');
  assert.ok(/GuideButton/.test(match), 'the in-match step-head 玩法说明 trigger stays');
  assert.ok(/gm__guide/.test(src('public/js/screens/game.js')), 'the in-match gear 玩法说明 trigger stays');
  const lobby = src('public/js/screens/lobby.js');
  assert.ok(lobby.includes('class="codex-entry"') && lobby.includes('openCodex'), 'the lobby top bar keeps the 资料库 entry');
  assert.ok(src('public/js/main.js').includes('<${CodexHost} />') && src('public/js/main.js').includes('<${GuideHost} />'), 'main.js still mounts both overlay hosts');
});

test('openBugReport / closeBugReport drive the global bug-report host (the mount the settings entry opens)', async () => {
  const { bugStore, openBugReport, closeBugReport, BugReportHost } = await import('../../public/js/ui/community.js');
  assert.equal(typeof BugReportHost, 'function', 'the global host is exported');
  assert.equal(bugStore.get().open, false, 'closed until asked');
  openBugReport();
  assert.equal(bugStore.get().open, true, 'openBugReport opens it');
  closeBugReport();
  assert.equal(bugStore.get().open, false, 'closeBugReport closes it');
});

test('the lobby / room top bars no longer carry the bug提交 / 玩法说明 buttons', () => {
  const lobby = src('public/js/screens/lobby.js');
  assert.ok(!lobby.includes('lobby-guide'), 'no 玩法说明 button in the lobby top bar');
  assert.ok(!lobby.includes('BugReportOverlay') && !/setShowCommunity\('bug'\)/.test(lobby), 'no bug提交 button / panel state in the lobby');
  assert.ok(/t\('公开房间'\)/.test(lobby) && /t\('更新日志'\)/.test(lobby) && lobby.includes('lobby-rooms'), '公开房间 / 更新日志 stay in the lobby top bar');
  const room = src('public/js/screens/room.js');
  assert.ok(!room.includes('room-guide') && !room.includes('GuideButton'), 'the room top bar carries no 玩法说明 button');
});

test('the bug overlay is mounted globally and stacks above the settings modal', () => {
  assert.ok(src('public/js/main.js').includes('BugReportHost'), 'main.js mounts the host once');
  assert.ok(/\.guide,\s*\.bug-host/.test(src('public/js/ui/components.js')), 'the settings modal yields focus / Escape to the overlay');
  const css = src('public/css/screens/lobby.css');
  assert.ok(/\.bug-host\s*\{[^}]*z-index:\s*calc\(var\(--z-modal\)\s*\+\s*4\)/.test(css), '.bug-host sits above --z-modal like the guide');
  const community = src('public/js/ui/community.js');
  assert.ok(/bug\.report/.test(community) && /community\/api\/bug\/upload/.test(community), 'submitting still goes through bug.report + the image upload');
});
