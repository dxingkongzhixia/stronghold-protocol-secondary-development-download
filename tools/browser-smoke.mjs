#!/usr/bin/env node
// tools/browser-smoke.mjs — the browser smoke the `browser-smoke-pre` / `browser-smoke-match` CI jobs run: mock-harness
// pages only, no game assets (the 720 MB public/assets pack is NOT needed), headless Chrome.
//
//   npm run test:browser:smoke                     every suite (local default)
//   npm run test:browser:smoke -- --group pre      the pre-game / hub suites (CI job 1)
//   npm run test:browser:smoke -- --group match    the in-match mock + the visual contract (CI job 2)
//   CHROME_PATH=… npm run test:browser:smoke
//
// Chrome: $CHROME_PATH, else the platform's usual install (setup-chrome on CI puts it on PATH; `google-chrome` is also
// checked). A missing Chrome is an error here, never a silent skip — the browser suites themselves skip when
// `SP_E2E` is not 1 and the hardcoded macOS path does not exist, which is how a Windows machine ran none of them.
//
// The runs (~6–7 min sequentially; each file gets its own browser, so keep them sequential — headless pages contend).
// Every entry is asset-free: the mock harness (public/dev/game-mock.html) and a server on port 0, never public/assets.
// A failing suite does not stop the run: every suite still runs and the final summary lists each failure (the exit code
// is non-zero if anything failed), so one red line never hides the others.
//
// pre-game and the hub:
//   1. test/ui/protocol-boot.e2e.test.js — the pre-game screens (协议启动！/ 请选择策略) through public/dev/game-mock.html,
//      including the no-art and reduced-motion variants: the client modules load, the CSP allows them, the screens render.
//   2. test/ui/title-surfaces.e2e.test.js — 公告 / 关于本服务器 and the PWA install offer (manifest + beforeinstallprompt).
//   3. test/ui/settings-entry.e2e.test.js — the lobby (hub) and room settings entries, the modal and bug提交.
//   4. test/ui/screen-fit.e2e.test.js — 异形屏适配: the inset box and the touch-only settings section (hasTouch).
//   5. test/ui/hotkeys.e2e.test.js — the in-match settings panel and its key rebinding (the mock's gear must be the
//      settings one: `.gm__gear` matches four buttons there).
//
// in-match mock (shop, economy, round plates, co-op, settlement, boss, drafts):
//   6.  test/ui/ready-fold.e2e.test.js         — 准备就绪 folds the shop bar, 取消准备 unfolds it
//   7.  test/ui/shop-empty-slot.e2e.test.js    — the shop bar's empty slot (GitHub #332)
//   8.  one interaction test of test/ui/mock.e2e.test.js — buy / ready / emote / exit through a mocked match
//   9.  test/ui/refresh-tap.e2e.test.js        — a lagging 刷新 pays once (GitHub #501)
//   10. test/ui/quit-offline.e2e.test.js       — 退出 survives a half-open socket
//   11. test/ui/spectator-roster.e2e.test.js   — the 观战者 capsule (GitHub #120)
//   12. test/ui/match-popups.e2e.test.js       — the round / phase plates
//   13. test/ui/resultbox.e2e.test.js          — the round's result box at settlement
//   14. test/ui/downed-plate.e2e.test.js       — 「协议已失效」 for a downed teammate
//   15. test/ui/terrain-tip.e2e.test.js        — the special-terrain tip (issue #184)
//   16. test/ui/facing.e2e.test.js             — the facing wheel's keyboard in the mock match
//   17. test/ui/deploy-replay.e2e.test.js      — the round start's deploy replay (PR #416)
//   18. test/ui/device-tip.e2e.test.js         — the stage-device tip (GitHub #228)
//   19. test/ui/feedback1-gaps.e2e.test.js     — the 0.1.1 screen gaps (DESIGN §21.26)
//   20. test/ui/feedback1-secret-shop.e2e.test.js — 机密商店 with the same item twice
//   21. test/ui/feedback1-tactic.e2e.test.js   — 战术决策 with the same card twice
//   22. test/ui/turn-popup.e2e.test.js         — the 机变「轮到你选」disc
//   23. test/ui/boss-plates.e2e.test.js        — the leader rounds' plates and the run's end
//   24. test/ui/visual-contract.e2e.test.js    — the visual contract: key surfaces exist, stay in the viewport, and
//       the ready / selected / disabled / danger states still change what is drawn (mean-colour + geometry probes)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The Chrome binary: $CHROME_PATH, a platform default, or one `which` finds. '' when none. */
export function resolveChrome(env = process.env, platform = process.platform) {
  if (env.CHROME_PATH && existsSync(env.CHROME_PATH)) return env.CHROME_PATH;
  const candidates = platform === 'win32'
    ? [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      ]
    : platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const c of candidates) if (existsSync(c)) return c;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']) {
    const r = spawnSync(platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
    const first = (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).find((s) => s && existsSync(s));
    if (r.status === 0 && first) return first;
  }
  return '';
}

/** The smoke run list: the single source of truth for the jobs and for docs/TEST-INVENTORY.md (tools/test-inventory.mjs). */
export const RUNS = [
  ['test/ui/protocol-boot.e2e.test.js'],
  ['test/ui/title-surfaces.e2e.test.js'],
  ['test/ui/settings-entry.e2e.test.js'],
  ['test/ui/screen-fit.e2e.test.js'],
  ['test/ui/hotkeys.e2e.test.js'],
  // + test/ui/match-info.e2e.test.js — the strategy draft's 本局信息 dialog (in the pre-game group: the draft is pre-battle)
  ['test/ui/match-info.e2e.test.js'],
  // + test/ui/stats-overlay.e2e.test.js — 统计数据 overlay: fixed over a hidden lobby, cards from a seeded list (hub group)
  ['test/ui/stats-overlay.e2e.test.js'],
  // in-match mock (shop, economy, round plates, co-op, settlement, boss)
  ['test/ui/ready-fold.e2e.test.js'],
  ['test/ui/shop-empty-slot.e2e.test.js'],
  ['--test-name-pattern=emote, exit', 'test/ui/mock.e2e.test.js'],
  ['test/ui/refresh-tap.e2e.test.js'],
  ['test/ui/quit-offline.e2e.test.js'],
  ['test/ui/spectator-roster.e2e.test.js'],
  ['test/ui/match-popups.e2e.test.js'],
  ['test/ui/resultbox.e2e.test.js'],
  ['test/ui/downed-plate.e2e.test.js'],
  ['test/ui/terrain-tip.e2e.test.js'],
  ['test/ui/facing.e2e.test.js'],
  ['test/ui/deploy-replay.e2e.test.js'],
  ['test/ui/device-tip.e2e.test.js'],
  ['test/ui/feedback1-gaps.e2e.test.js'],
  ['test/ui/feedback1-secret-shop.e2e.test.js'],
  ['test/ui/feedback1-tactic.e2e.test.js'],
  // + test/ui/round30-tools.e2e.test.js — isolated component/tool fixtures in a real browser (8 s)
  ['test/ui/round30-tools.e2e.test.js'],
  ['test/ui/turn-popup.e2e.test.js'],
  ['test/ui/boss-plates.e2e.test.js'],
  // the visual contract (surfaces + ready / selected / disabled / danger state probes)
  ['test/ui/visual-contract.e2e.test.js'],
  // + test/ui/text-scale.e2e.test.js — 文字大小: the HUD bar keeps its size while its text grows (2026-11-23 fix)
  ['test/ui/text-scale.e2e.test.js'],
  // + test/ui/inspect-range.e2e.test.js — COMBAT: the open card lights the unit's attack range (rewritten 2026-11-23)
  ['test/ui/inspect-range.e2e.test.js'],
];

/** The pre-game / hub group (the first five suites). `--group match` is everything else. */
export const PRE_GROUP = new Set([
  'test/ui/protocol-boot.e2e.test.js',
  'test/ui/title-surfaces.e2e.test.js',
  'test/ui/settings-entry.e2e.test.js',
  'test/ui/screen-fit.e2e.test.js',
  'test/ui/hotkeys.e2e.test.js',
  'test/ui/match-info.e2e.test.js',
  'test/ui/stats-overlay.e2e.test.js',
]);

/**
 * The suites of one group. CI runs `pre` and `match` as two parallel jobs so the wall clock stays under the 8-minute
 * budget; `all` is the local default.
 * @param {'pre'|'match'|'all'} group
 * @param {string[][]} runs
 * @returns {string[][]}
 */
export function selectRuns(group = 'all', runs = RUNS) {
  if (group === 'all') return runs;
  return runs.filter((args) => {
    const file = args.find((s) => s.endsWith('.js'));
    return PRE_GROUP.has(file) === (group === 'pre');
  });
}

/** `--group pre|match|all` (also `--group=…`), default `all`. */
function groupArg(argv) {
  const i = argv.indexOf('--group');
  const raw = i >= 0 && argv[i + 1] ? argv[i + 1] : (argv.find((a) => a.startsWith('--group=')) || '').slice('--group='.length);
  const group = raw || 'all';
  if (!['pre', 'match', 'all'].includes(group)) {
    console.error(`[browser-smoke] unknown --group ${group} (pre|match|all)`);
    process.exit(2);
  }
  return /** @type {'pre'|'match'|'all'} */ (group);
}

const isMain = import.meta.url === new URL(process.argv[1] ?? '', 'file://').href || process.argv[1]?.endsWith('browser-smoke.mjs');
if (isMain) {
  const chrome = resolveChrome();
  if (!chrome) {
    console.error('[browser-smoke] no Chrome found: set CHROME_PATH (CI: browser-actions/setup-chrome)');
    process.exit(2);
  }
  const env = { ...process.env, CHROME_PATH: chrome, SP_E2E: '1' };
  console.log(`[browser-smoke] Chrome ${chrome}`);
  // Run every suite even when one fails: a single red suite must not hide the result of the others, and the summary
  // below is what CI's log is read from. The exit code still fails the job when anything failed.
  const group = groupArg(process.argv.slice(2));
  const runs = selectRuns(group);
  console.log(`[browser-smoke] group ${group} (${runs.length} suites)`);
  const results = [];
  for (const args of runs) {
    console.log(`[browser-smoke] node --test ${args.join(' ')}`);
    const started = Date.now();
    const r = spawnSync(process.execPath, ['--test', '--test-timeout=600000', '--test-force-exit', ...args], { stdio: 'inherit', cwd: ROOT, env });
    const secs = Math.round((Date.now() - started) / 1000);
    const code = r.status ?? 1;
    results.push({ name: args.join(' '), code, secs });
    console.log(`[browser-smoke] ${code === 0 ? 'PASS' : 'FAIL'} ${args.join(' ')} (${secs}s)\n`);
  }
  const failed = results.filter((x) => x.code !== 0);
  if (failed.length) {
    console.error(`[browser-smoke] ${failed.length}/${results.length} suite(s) failed:`);
    for (const f of failed) console.error(`  - ${f.name} (exit ${f.code}, ${f.secs}s)`);
    process.exit(1);
  }
  console.log(`[browser-smoke] ok (${results.length} suites, ${results.reduce((s, x) => s + x.secs, 0)}s)`);
}
