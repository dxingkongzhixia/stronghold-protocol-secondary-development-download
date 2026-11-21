#!/usr/bin/env node
// tools/browser-smoke.mjs — the small browser smoke the `browser-smoke` CI job runs: mock-harness pages only, no game
// assets (the 720 MB public/assets pack is NOT needed), headless Chrome.
//
//   npm run test:browser:smoke            CI and local
//   CHROME_PATH=… npm run test:browser:smoke
//
// Chrome: $CHROME_PATH, else the platform's usual install (setup-chrome on CI puts it on PATH; `google-chrome` is also
// checked). A missing Chrome is an error here, never a silent skip — the browser suites themselves skip when
// `SP_E2E` is not 1 and the hardcoded macOS path does not exist, which is how a Windows machine ran none of them.
//
// The two runs:
//   1. test/ui/protocol-boot.e2e.test.js — the pre-game screens (协议启动！/ 请选择策略) through public/dev/game-mock.html,
//      including the no-art and reduced-motion variants: the client modules load, the CSP allows them, the screens render.
//   2. one interaction test of test/ui/mock.e2e.test.js (in-match mock): buy / ready / emote / exit through a mocked
//      match — the cheapest check that the in-match UI still boots and responds.
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

const RUNS = [
  ['test/ui/protocol-boot.e2e.test.js'],
  ['--test-name-pattern=emote, exit', 'test/ui/mock.e2e.test.js'],
];

const isMain = import.meta.url === new URL(process.argv[1] ?? '', 'file://').href || process.argv[1]?.endsWith('browser-smoke.mjs');
if (isMain) {
  const chrome = resolveChrome();
  if (!chrome) {
    console.error('[browser-smoke] no Chrome found: set CHROME_PATH (CI: browser-actions/setup-chrome)');
    process.exit(2);
  }
  const env = { ...process.env, CHROME_PATH: chrome, SP_E2E: '1' };
  console.log(`[browser-smoke] Chrome ${chrome}`);
  for (const args of RUNS) {
    console.log(`[browser-smoke] node --test ${args.join(' ')}`);
    const r = spawnSync(process.execPath, ['--test', ...args], { stdio: 'inherit', cwd: ROOT, env });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  console.log('[browser-smoke] ok');
}
