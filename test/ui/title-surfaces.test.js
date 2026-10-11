// The title screen's three new surfaces (owner's request, 2026-10-11), copied from another deployment into our fork:
//   ① 公告 banner + 公告 entry — wired to our OWN notice store: the durable changelog (server/community.js,
//      `source: 'notice'`, GET /community/api/changelog). Dismissal persists per announcement (loadPref/savePref),
//      and nothing to show / offline hides it (ui/announce.js).
//   ② 关于本服务器 — a factual dialog about OUR project (version/build, modes, README framing, attribution; ui/about.js).
//   ③ 添加到桌面 — the browser install prompt (beforeinstallprompt → prompt()), hidden when unavailable (ui/install.js).
// Pure logic + wiring here (no browser); the click-through is title-surfaces.e2e.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { latestNotice, announcementKey, shouldAnnounce, seenAnnouncement, markAnnouncementSeen } from '../../public/js/ui/announce.js';
import { aboutServerInfo, PROJECT_URL } from '../../public/js/ui/about.js';
import { installVisible, installHintMessage, createPwaInstall } from '../../public/js/ui/install.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Run `fn` with a throwaway in-memory localStorage (store.js loadPref/savePref read globalThis.localStorage). */
function withLocalStorage(fn) {
  const mem = new Map();
  const prev = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
    clear: () => { mem.clear(); },
  };
  try { return fn(mem); } finally { if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev; }
}

/** A fake window (EventTarget + matchMedia) for createPwaInstall. */
function installRig(standalone = false) {
  const win = new EventTarget();
  const display = new EventTarget();
  display.matches = standalone;
  win.matchMedia = () => display;
  win.navigator = {};
  const pwa = createPwaInstall(win);
  const offer = (outcome = 'dismissed', fail = false) => {
    let calls = 0;
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = async () => { calls++; if (fail) throw new Error('unavailable'); return { outcome }; };
    win.dispatchEvent(e);
    return { calls: () => calls, e };
  };
  return { pwa, win, display, offer };
}

test('公告: the newest `source: notice` changelog entry wins; releases are ignored; empty data is fine', () => {
  const list = [
    { id: 9, version: '0.4.1', source: 'release', summary: 'a release' },
    { id: 8, version: '0.4.0', source: 'notice', summary: 'the newest notice' },
    { id: 7, version: '0.3.9', source: 'notice', summary: 'an older notice' },
  ];
  assert.equal(latestNotice(list).id, 8, 'the first notice (newest-first) wins, not the release above it');
  assert.equal(latestNotice([{ id: 1, source: 'release' }]), null, 'no notice entry → nothing to announce');
  assert.equal(latestNotice([]), null);
  assert.equal(latestNotice(null), null);
  assert.equal(announcementKey({ id: 8 }), 'notice:8');
  assert.equal(announcementKey({ version: '0.4.0' }), 'notice:0.4.0');
  assert.equal(announcementKey(null), '');
  assert.equal(shouldAnnounce(list[1], ''), true);
  assert.equal(shouldAnnounce(list[1], 'notice:8'), false, 'the same announcement does not nag');
  assert.equal(shouldAnnounce(list[1], 'notice:7'), true, 'a seen older key does not hide a newer notice');
  assert.equal(shouldAnnounce(null, ''), false, 'nothing to show');
});

test('公告: dismissal persists a seen key through loadPref/savePref (and a newer notice re-opens)', () => {
  withLocalStorage(() => {
    const older = { id: 41, source: 'notice', summary: 'old' };
    const newer = { id: 42, source: 'notice', summary: 'new' };
    assert.equal(seenAnnouncement(), '', 'nothing dismissed yet');
    markAnnouncementSeen(older);
    assert.equal(seenAnnouncement(), 'notice:41');
    assert.equal(shouldAnnounce(older, seenAnnouncement()), false, 'the dismissed notice stays hidden');
    assert.equal(shouldAnnounce(newer, seenAnnouncement()), true, 'a newer notice shows again');
  });
});

test('公告: the title mounts the banner + the 公告 entry, and the entry opens our (re-titled) changelog overlay', () => {
  const title = src('public/js/screens/title.js');
  assert.ok(/AnnounceBanner/.test(title) && /AnnouncementsOverlay/.test(title) && /AnnounceButton/.test(title), 'the three surfaces are imported/mounted');
  assert.ok(/t\('关于本服务器'\)/.test(title), 'the 关于本服务器 entry is on the title');
  const announce = src('public/js/ui/announce.js');
  assert.ok(/community\/api\/changelog/.test(announce), 'the banner reads our real changelog endpoint');
  assert.ok(/loadPref|savePref/.test(announce) && /noticeSeen/.test(announce), 'dismissal persists through store.js prefs');
  const community = src('public/js/ui/community.js');
  assert.ok(/title = t\('更新日志'\)/.test(community), 'ChangelogOverlay takes a title (公告 reuses the one store)');
});

test('关于本服务器: aboutServerInfo is factual and drops what the server did not report', () => {
  const full = aboutServerInfo({ version: '0.4.0', devBuild: false, build: 'a1b2c3d4', online: 7, modes: ['FUNNY', 'NORMAL'] });
  assert.deepEqual(full, { version: '0.4.0', devBuild: false, build: 'a1b2c3d4', online: 7, modes: ['FUNNY', 'NORMAL'] });
  const defaults = aboutServerInfo();
  assert.equal(defaults.version, '0.4.0', 'defaults to the release version the client carries');
  assert.deepEqual(defaults.modes, ['FUNNY', 'NORMAL', 'HARD', 'ABYSS'], 'the modes this server offers');
  assert.equal(defaults.build, null);
  assert.equal(defaults.online, null);
  const offline = aboutServerInfo({ build: '', online: NaN, modes: [null, 'HARD', ''] });
  assert.equal(offline.build, null, 'an empty build tag is omitted');
  assert.equal(offline.online, null, 'no online count is omitted');
  assert.deepEqual(offline.modes, ['HARD'], 'junk mode ids are dropped');
  assert.match(PROJECT_URL, /gitee\.com\/marseille1\/stronghold-protocol-secondary-development-download/);
});

test('关于本服务器: the dialog shows version / build / modes / attribution and links the project repo (README framing)', () => {
  const about = src('public/js/ui/about.js');
  for (const key of ['关于本服务器', '版本', '服务器构建', '可用模式', '在线人数', '项目仓库']) {
    assert.ok(about.includes(`t('${key}')`), `shows ${key}`);
  }
  assert.ok(/healthz/.test(about), 'the served build tag comes from /healthz');
  assert.ok(/DIFFICULTY_NAMES/.test(about), 'the mode list is the difficulties the server uses');
  assert.ok(about.includes('非官方同人复刻 · 游戏素材版权归 上海鹰角网络 / Yostar 所有'), 'the footer attribution is reused');
  assert.ok(/Gitee 仓库分发/.test(about), 'the README download/mirror framing');
});

test('部署说明: the desktop-only / mobile-compatibility note is in the about dialog and on the title screen', () => {
  const note = '仅支持网页版（桌面浏览器）；手机端可能存在兼容问题';
  const about = src('public/js/ui/about.js');
  const title = src('public/js/screens/title.js');
  assert.ok(about.includes(`t('${note}')`), 'the about dialog states the platform note');
  assert.ok(title.includes(`t('${note}')`), 'the title screen shows the one-line hint');
  assert.ok(/title-platform-hint/.test(title) && /\.title-platform-hint/.test(src('public/css/screens/title.css')), 'the hint has its own line / style');
});

test('添加到桌面: the button shows only while the browser has an install offer, and never once installed', () => {
  assert.equal(installVisible({ hasOffer: true }), true);
  assert.equal(installVisible({ hasOffer: false }), false, 'no beforeinstallprompt → hidden (our build, and any non-installable page)');
  assert.equal(installVisible({ hasOffer: true, installed: true }), false, 'already installed → hidden');
  assert.equal(installVisible({ hasOffer: true, standalone: true }), false, 'running standalone → hidden');
  assert.equal(installHintMessage({ hasOffer: true }), null, 'an offer needs no hint');
  assert.equal(installHintMessage({ hasOffer: false, ios: false }), null, 'no manual affordance → nothing');
  assert.equal(installHintMessage({ hasOffer: false, ios: true }), '请在浏览器菜单中选择「添加到主屏幕」', 'iOS Safari has no prompt event — show the manual hint');
  assert.equal(installHintMessage({ hasOffer: false, ios: true, installed: true }), null, 'installed → no hint');
});

test('添加到桌面: beforeinstallprompt present → available; prompt() consumes it; appinstalled / standalone hide it', async () => {
  // absent
  const a = installRig();
  assert.equal(a.pwa.available(), false, 'no event → not available');
  const states = [];
  const off = a.pwa.subscribe((x) => states.push(x));
  assert.deepEqual(states, [false], 'subscribe reports the current value at once');
  const first = a.offer();
  assert.equal(first.e.defaultPrevented, true, 'the banner is suppressed while we hold the prompt');
  assert.equal(a.pwa.available(), true, 'an offer makes the button available');
  assert.equal(await a.pwa.request(), false, 'a dismissed prompt resolves false');
  assert.equal(a.pwa.available(), false, 'the offer is consumed');
  assert.equal(first.calls(), 1);
  assert.equal(await a.pwa.request(), false, 'a second click with no offer is a no-op');
  assert.equal(first.calls(), 1);
  const next = a.offer('accepted');
  assert.equal(await a.pwa.request(), true);
  assert.equal(next.calls(), 1);
  const broken = a.offer('accepted', true);
  assert.equal(await a.pwa.request(), false, 'a throwing prompt is a false, not a crash');
  assert.equal(broken.calls(), 1);
  off();
  a.pwa.dispose();
  // appinstalled hides it and re-offers do not come back
  const b = installRig();
  b.offer();
  assert.equal(b.pwa.available(), true);
  b.win.dispatchEvent(new Event('appinstalled'));
  assert.equal(b.pwa.available(), false, 'appinstalled → hidden');
  b.offer();
  assert.equal(b.pwa.available(), false, 'no re-offer after installed');
  b.pwa.dispose();
  // standalone display mode → never available
  const c = installRig(true);
  c.offer();
  assert.equal(c.pwa.available(), false, 'running standalone → hidden');
  c.pwa.dispose();
  // dispose removes listeners: a later offer is not prevented
  const d = installRig();
  d.pwa.dispose();
  assert.equal(d.offer().e.defaultPrevented, false, 'listeners removed after dispose');
});

test('our build has no PWA manifest / service worker, so the install button stays a graceful no-op', () => {
  // The premise "upstream 0.2.3 install-icon work is merged" does NOT hold on `ours`: there is no public/manifest.json,
  // public/icons/ or service worker, so no browser fires beforeinstallprompt here. The button must therefore hide.
  for (const p of ['public/manifest.json', 'public/manifest.webmanifest', 'public/sw.js', 'public/service-worker.js']) {
    let exists = true;
    try { readFileSync(join(ROOT, p)); } catch { exists = false; }
    assert.equal(exists, false, `${p} is not in our tree (button hidden by installVisible)`);
  }
  assert.ok(/InstallButton/.test(src('public/js/screens/title.js')), 'the InstallButton is still mounted (it decides at runtime)');
  assert.ok(!/rel="manifest"/.test(src('public/index.html')), 'no manifest link in our index.html');
});
