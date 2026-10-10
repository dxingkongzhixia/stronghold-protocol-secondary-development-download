// test/community.test.js — the lobby's community data (server/community.js, docs/MATCHMAKING.md §36):
// the changelog (seeded once from CHANGELOG.md), player bug reports (TEXT + raster images), the image sniffing /
// on-disk storage, validation, ownership and rate limits, and the HTTP paths (public changelog + token-gated admin).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openMemoryDb } from '../server/db.mjs';
import { AuthService } from '../server/auth.js';
import { CommunityService, sanitizeText, sniffImageType, parseChangelogMarkdown, summarizeChangelog, bugReportsToCsv, bugReportsExport } from '../server/community.js';
import { Lobby } from '../server/lobby.js';
import { SessionRegistry } from '../server/net.js';
import { validateC2S } from '../shared/protocol.js';
import { APP_VERSION } from '../shared/constants.js';
import { startServer } from '../server/index.js';

const png = (n = 16) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n)]);
const jpg = (n = 16) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(n)]);
const webp = (n = 16) => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(n)]);
const tmp = () => mkdtempSync(join(tmpdir(), 'sp-community-'));

test('parseChangelogMarkdown: versions, ISO dates, bodies; a heading without a date', () => {
  const md = [
    '# 更新记录', '',
    '## 0.2.0 — 2026-10-07', 'Big release.', '## 0.1.4', 'No date here.',
    '## 0.1.3 – 2026-10-04', 'Fix.',
  ].join('\n');
  const out = parseChangelogMarkdown(md);
  assert.deepEqual(out.map((e) => e.version), ['0.2.0', '0.1.4', '0.1.3']);
  assert.equal(out[0].releasedAt, Date.UTC(2026, 9, 7));
  assert.equal(out[1].releasedAt, null, 'a version without a date');
  assert.equal(out[0].title, '0.2.0');
  assert.equal(out[0].body, 'Big release.');
  assert.equal(out[2].body, 'Fix.');
  assert.equal(out[0].summary, 'Big release.', 'the derived gist is the body when it is a single line');
  assert.equal(out[1].summary, 'No date here.');
});

test('summarizeChangelog: first meaningful line, markdown markers stripped, first sentence, trimmed', () => {
  assert.equal(summarizeChangelog(''), '');
  assert.equal(summarizeChangelog('   \n\n  '), '');
  assert.equal(summarizeChangelog('## Head\n\nFirst line.\nmore'), 'First line.');
  assert.equal(summarizeChangelog('- bullet one\n- bullet two'), 'bullet one');
  assert.equal(summarizeChangelog('第一条。第二条。'), '第一条。', 'cut at the first Chinese sentence end');
  assert.equal(summarizeChangelog('a'.repeat(200)).length, 121, 'trimmed to the max + an ellipsis');
  assert.ok(summarizeChangelog('a'.repeat(200)).endsWith('…'));
});

test('sanitizeText: control / bidi stripped, single-line collapses spaces, multiline keeps newlines', () => {
  assert.equal(sanitizeText('  a\tb\nc  '), 'a b c');
  assert.equal(sanitizeText('a\u200bb\u202ec'), 'abc');
  assert.equal(sanitizeText('x\n\n\n\ny', { multiline: true }), 'x\n\ny');
  assert.equal(sanitizeText(null), '');
});

test('sniffImageType: png / jpeg / webp from the bytes; svg, html and short buffers are refused', () => {
  assert.equal(sniffImageType(png()), 'image/png');
  assert.equal(sniffImageType(jpg()), 'image/jpeg');
  assert.equal(sniffImageType(webp()), 'image/webp');
  assert.equal(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(sniffImageType(Buffer.from('<!doctype html><script>x</script>')), null);
  assert.equal(sniffImageType(Buffer.from([1, 2, 3])), null);
  assert.equal(sniffImageType('not a buffer'), null);
});

test('db migration v4: the community tables + the notice-log columns exist', () => {
  const db = openMemoryDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  for (const t of ['changelog', 'bug_reports', 'bug_uploads']) assert.ok(tables.includes(t), `${t} exists`);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
  const cols = db.prepare('PRAGMA table_info(changelog)').all().map((r) => r.name);
  for (const c of ['summary', 'source', 'minor_seq']) assert.ok(cols.includes(c), `changelog.${c} exists`);
});

test('changelog: insert, newest first, published filter, seed once', () => {
  let now = 0;
  const svc = new CommunityService({ db: openMemoryDb(), now: () => now++ });
  assert.equal(svc.addChangelog({ version: '0.1.0', releasedAt: 1, title: '0.1.0', body: 'a' }).ok, true);
  svc.addChangelog({ version: '0.2.0', releasedAt: 2, title: '0.2.0', body: 'b' });
  svc.addChangelog({ version: '0.3.0', releasedAt: 3, title: '0.3.0', body: 'c', published: false });
  assert.deepEqual(svc.listChangelog().map((e) => e.version), ['0.2.0', '0.1.0'], 'newest first, unpublished hidden');
  assert.deepEqual(svc.listChangelog({ includeUnpublished: true }).map((e) => e.version), ['0.3.0', '0.2.0', '0.1.0']);
  assert.equal(svc.addChangelog({ version: '', title: '' }).error, 'BAD_REPORT');
  const first = svc.listChangelog()[1];
  assert.equal(first.summary, 'a', 'the gist is derived from the body when none is given');
  assert.equal(first.source, 'release', 'a seeded row defaults to source release');
  assert.equal(first.minor_seq, null);

  const md = '## 9.9.9 — 2030-01-01\nseed';
  assert.deepEqual(svc.importChangelogMarkdown(md), { ok: true, imported: 0, skipped: true }, 'a non-empty table is not re-seeded');
  assert.equal(svc.changelogCount(), 3);
  const fresh = new CommunityService({ db: openMemoryDb() });
  assert.deepEqual(fresh.importChangelogMarkdown(md), { ok: true, imported: 1, skipped: false });
  assert.equal(fresh.listChangelog()[0].version, '9.9.9');
  assert.equal(fresh.listChangelog()[0].summary, 'seed');
});

test('recordNotice: a monotonic minor version per notice, derived from APP_VERSION, logged with source notice', () => {
  let now = 1000;
  const svc = new CommunityService({ db: openMemoryDb(), now: () => now++, appVersion: '0.2.0' });
  // a seeded release that happens to sit at 0.2.1 and 0.2.2 must not be overwritten by a notice
  svc.addChangelog({ version: '0.2.1', releasedAt: 1, title: '0.2.1', body: 'seeded patch release' });
  svc.addChangelog({ version: '0.2.2', releasedAt: 2, title: '0.2.2', body: 'another seeded' });

  const a = svc.recordNotice({ text: '服务器将在 5 分钟后重启更新' });
  assert.equal(a.ok, true);
  assert.equal(a.version, '0.2.3', 'skips the seeded 0.2.1 / 0.2.2');
  assert.equal(a.minor_seq, 3, 'the counter jumped past the seeded versions, so the next version stays unique');

  const b = svc.recordNotice({ text: '修复了某个问题' });
  assert.equal(b.version, '0.2.4', 'monotonic +1');
  assert.equal(b.minor_seq, 4);
  assert.equal(svc.recordNotice({ text: '   ' }).error, 'BAD_REPORT');

  const list = svc.listChangelog();
  assert.deepEqual(list.slice(0, 2).map((e) => e.version), ['0.2.4', '0.2.3'], 'newest first');
  assert.equal(list[0].source, 'notice');
  assert.equal(list[0].minor_seq, 4);
  assert.equal(list[0].summary, '修复了某个问题', 'the notice text is its own summary');
  assert.equal(list[0].body, '修复了某个问题');
  assert.equal(list.find((e) => e.version === '0.2.1').source, 'release', 'a seeded row keeps source release');

  // an explicit appVersion drives the base: 0.3.x, still monotonic from the stored seq (never renumbered)
  const svc2 = new CommunityService({ db: openMemoryDb(), now: () => now++, appVersion: '0.3.0' });
  assert.equal(svc2.recordNotice({ text: 'one' }).version, '0.3.1');
  assert.equal(svc2.recordNotice({ text: 'two' }).version, '0.3.2');
});

test('broadcastNotice: a failing changelog write is logged and never stops the push', () => {
  const registry = new SessionRegistry({ now: () => 0 });
  const warns = [];
  const lobby = new Lobby({
    registry, now: () => 5000,
    log: { info() {}, warn(m) { warns.push(String(m)); }, error() {}, debug() {} },
    community: { recordNotice() { throw new Error('disk full'); } },
  });
  const doctor = registry.create('Doctor');
  doctor.connected = true; doctor.accountId = 7;
  doctor.ws = { readyState: 1, bufferedAmount: 0, sent: [], send(d) { this.sent.push(d); } };
  const r = lobby.broadcastNotice({ text: '马上重启', sign: 'd星空之下' });
  assert.equal(r.ok, true);
  assert.equal(r.sent, 1, 'the push went out');
  assert.equal(r.changelog, null, 'no version when the write failed');
  assert.equal(doctor.ws.sent.length, 1, 'the frame reached the player');
  assert.match(JSON.parse(doctor.ws.sent[0]).text, /马上重启/);
  assert.ok(warns.some((w) => /notice changelog failed/.test(w)), 'the failure was logged');
  assert.equal(lobby.notices.length, 1, 'the notice history is unaffected');
});

test('bug reports: insert / list / status; validation and titles', () => {
  const db = openMemoryDb();
  const acc = new AuthService({ db }).register('Reporter', 'secret1').account;
  const svc = new CommunityService({ db });
  const bad = svc.createBugReport({ title: '   ' });
  assert.equal(bad.error, 'BAD_REPORT');
  assert.equal(svc.createBugReport({ title: 'x'.repeat(200) }).error, 'BAD_REPORT');
  assert.equal(svc.createBugReport({ title: 'ok', body: 'y'.repeat(3000) }).error, 'BAD_REPORT');
  const r = svc.createBugReport({ title: 'Crash on 险境', body: 'step 1\nstep 2', accountId: acc.id, submitter: 'Doctor', key: `account:${acc.id}` });
  assert.equal(r.ok, true);
  assert.equal(r.report.status, 'new');
  assert.equal(r.report.accountId, acc.id);
  // a stale / unknown account id does not trip the FK — it just becomes a guest report
  assert.equal(svc.createBugReport({ title: 'orphan', accountId: 999999 }).report.accountId, null);
  const list = svc.listBugReports();
  assert.equal(list.length, 2, 'the guest report and the account report');
  const mine = list.find((r) => r.title === 'Crash on 险境');
  assert.ok(mine);
  assert.deepEqual([mine.title, mine.body], ['Crash on 险境', 'step 1\nstep 2']);
  assert.equal(svc.setBugStatus(mine.id, 'fixed').ok, true);
  assert.equal(svc.listBugReports({ status: 'fixed' }).length, 1);
  assert.equal(svc.listBugReports({ status: 'new' }).length, 1, 'the guest report is still new');
  assert.equal(svc.setBugStatus(mine.id, 'bogus').error, 'BAD_REPORT');
  assert.equal(svc.setBugStatus(9999, 'new').error, 'BAD_REPORT');
});

test('rate limit: reports and uploads per key / window', () => {
  let now = 1000;
  const dir = tmp();
  try {
    const svc = new CommunityService({ db: openMemoryDb(), dir, now: () => now, reportLimit: 2, uploadLimit: 2, windowMs: 1000 });
    assert.equal(svc.createBugReport({ title: 'a', key: 'k' }).ok, true);
    assert.equal(svc.createBugReport({ title: 'b', key: 'k' }).ok, true);
    assert.equal(svc.createBugReport({ title: 'c', key: 'k' }).error, 'RATE');
    assert.equal(svc.createBugReport({ title: 'c', key: 'other' }).ok, true, 'another key is independent');
    now += 1001;
    assert.equal(svc.createBugReport({ title: 'd', key: 'k' }).ok, true, 'the window slid');

    assert.equal(svc.saveUpload({ key: 'u', bytes: png() }).ok, true);
    assert.equal(svc.saveUpload({ key: 'u', bytes: jpg() }).ok, true);
    assert.equal(svc.saveUpload({ key: 'u', bytes: webp() }).error, 'RATE');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('uploads: written to disk, sniffed mime, ownership binds at report time, pruned when orphaned', () => {
  let now = 5000;
  const dir = tmp();
  try {
    const svc = new CommunityService({ db: openMemoryDb(), dir, now: () => now });
    assert.equal(svc.saveUpload({ key: 'account:1', bytes: Buffer.from('not an image at all') }).error, 'BAD_IMAGE');
    assert.equal(svc.saveUpload({ key: 'account:1', bytes: Buffer.alloc(0) }).error, 'BAD_IMAGE');
    const up = svc.saveUpload({ key: 'account:1', accountId: 1, bytes: png(32) });
    assert.equal(up.ok, true);
    assert.equal(up.upload.mime, 'image/png');
    assert.equal(up.upload.bytes, 40);
    const row = svc.getUpload(up.upload.id);
    assert.ok(existsSync(join(dir, row.path)), 'the file is on disk');
    assert.deepEqual(svc.readUpload(row), png(32));

    // another key may not attach it
    assert.equal(svc.createBugReport({ title: 't', images: [up.upload.id], key: 'account:2' }).error, 'BAD_IMAGE');
    const r = svc.createBugReport({ title: 'mine', images: [up.upload.id], key: 'account:1', accountId: 1 });
    assert.equal(r.ok, true);
    assert.deepEqual(r.report.images.map((i) => i.id), [up.upload.id]);
    // a claimed image cannot be attached twice
    assert.equal(svc.createBugReport({ title: 'again', images: [up.upload.id], key: 'account:1' }).error, 'BAD_IMAGE');
    assert.equal(svc.listBugReports()[0].images.length, 1);

    // orphan pruning
    const orphan = svc.saveUpload({ key: 'account:1', bytes: jpg() });
    now += 48 * 60 * 60 * 1000;
    assert.equal(svc.pruneUploads(), 1);
    assert.equal(svc.getUpload(orphan.upload.id), null, 'the orphan row is gone');
    assert.ok(svc.getUpload(up.upload.id), 'the attached upload is kept');
    assert.ok(existsSync(join(dir, svc.getUpload(up.upload.id).path)), 'and its file stays on disk');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bug.report is a validated C2S message', () => {
  assert.equal(validateC2S({ t: 'bug.report', title: 'hello' }), null);
  assert.equal(validateC2S({ t: 'bug.report', title: 'hello', body: 'world', images: [1, 2] }), null);
  assert.notEqual(validateC2S({ t: 'bug.report' }), null, 'title required');
  assert.notEqual(validateC2S({ t: 'bug.report', title: 'x', images: [1, 2, 3, 4, 5] }), null, 'at most BUG_IMAGES_MAX');
});

// The HTTP surface: the public changelog, a guest/account upload, the lobby's bug.report handler, the admin list and
// the token-gated image route (docs/MATCHMAKING.md §36).
test('HTTP: changelog, upload, bug.report, admin list / status / image', async () => {
  const dir = tmp();
  const srv = await startServer({ port: 0, quiet: true, accounts: true, db: openMemoryDb(), adminToken: 'tok', uploadDir: dir });
  try {
    const base = `http://localhost:${srv.port}`;
    // ① the changelog seeded once from CHANGELOG.md (token-free)
    const clog = await (await fetch(`${base}/community/api/changelog`)).json();
    assert.ok(clog.changelog.length >= 6, `${clog.changelog.length} changelog entries`);
    assert.equal(clog.changelog[0].version, APP_VERSION, 'newest first (the current release)');
    assert.equal(clog.changelog[0].source, 'release', 'a seeded row is source release');
    assert.ok(clog.changelog[0].summary && clog.changelog[0].summary.length > 0, 'the seeded row carries a summary');
    for (const k of ['id', 'version', 'released_at', 'title', 'body', 'summary', 'source']) {
      assert.ok(k in clog.changelog[0], `the API keeps the ${k} field`);
    }

    // ② an account uploads an image (token header), then the report references it over the lobby handler
    const acc = srv.auth.register('Reporter', 'secret1');
    const upRes = await fetch(`${base}/community/api/bug/upload`, { method: 'POST', headers: { 'Content-Type': 'image/png', 'X-Account-Token': acc.token }, body: png(64) });
    assert.equal(upRes.status, 200);
    const up = await upRes.json();
    assert.equal(up.mime, 'image/png');
    // a malformed image is refused
    assert.equal((await fetch(`${base}/community/api/bug/upload`, { method: 'POST', body: Buffer.from('<svg/>') })).status, 400);

    const session = { accountId: acc.account.id, limitKey: null, playerId: 'p_test', name: 'Reporter' };
    assert.deepEqual(srv.lobby.bugReport(session, { title: 'It broke', body: 'steps', images: [up.id] }), { ok: true });
    assert.equal(srv.lobby.bugReport(session, { title: '   ' }).error, 'BAD_REPORT');

    // ③ the admin sees the report + image, can mark it 已修复 and view the image (token-gated)
    const st = await (await fetch(`${base}/admin/api/state?token=tok`)).json();
    assert.equal(st.bugs.length, 1);
    assert.equal(st.bugs[0].title, 'It broke');
    assert.deepEqual(st.bugs[0].images.map((i) => i.mime), ['image/png']);
    assert.equal((await fetch(`${base}/admin/api/bug/image/${up.id}`)).status, 403, 'token required');
    const img = await fetch(`${base}/admin/api/bug/image/${up.id}?token=tok`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((await img.arrayBuffer()).byteLength === 72);
    const html = await (await fetch(`${base}/admin?token=tok`)).text();
    assert.match(html, /玩家反馈/);
    assert.match(html, /\/admin\/api\/bug\/image\//);
    assert.match(html, /记入「更新日志」的下一小版本/, 'the notice form hints the changelog entry');

    const post = (body) => fetch(`${base}/admin/api/bug/status?token=tok`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ id: st.bugs[0].id, status: 'fixed' })).status, 200);
    assert.equal((await (await fetch(`${base}/admin/api/state?token=tok`)).json()).bugs[0].status, 'fixed');
    assert.equal((await post({ id: st.bugs[0].id, status: 'nope' })).status, 400);

    // ④ an operator notice is pushed AND logged as the next minor changelog entry (docs/MATCHMAKING.md §36)
    const notify = (body) => fetch(`${base}/admin/api/notify?token=tok`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const n = await (await notify({ text: '服务器将在 5 分钟后重启更新', sign: 'd星空之下' })).json();
    assert.equal(n.ok, true);
    const mm = APP_VERSION.split(/[.-]/).slice(0, 2).join('\\.');
    assert.ok(n.changelog && new RegExp(`^${mm}\\.\\d+$`).test(n.changelog.version), `the notice is logged as a minor version (${n.changelog && n.changelog.version})`);
    const after = await (await fetch(`${base}/community/api/changelog`)).json();
    assert.equal(after.changelog[0].version, n.changelog.version, 'the new entry is newest first');
    assert.equal(after.changelog[0].source, 'notice');
    assert.equal(after.changelog[0].summary, '服务器将在 5 分钟后重启更新', 'the notice text is the summary');
    assert.equal(after.changelog[0].body, '服务器将在 5 分钟后重启更新');
    const seeded = after.changelog.find((e) => e.version === '0.2.0');
    assert.equal(seeded.source, 'release', 'the seeded release is untouched');
    // a second notice takes the next minor version, never reusing one
    const n2 = await (await notify({ text: '又一条通知' })).json();
    assert.notEqual(n2.changelog.version, n.changelog.version);
    assert.ok(n2.changelog.version > n.changelog.version, 'monotonic');
  } finally {
    await srv.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// 筛选 / 排序 (docs/MATCHMAKING.md §36.3): the list is filtered and sorted SERVER-SIDE, so the rules apply to the whole
// set — a matching report older than the newest 100 is still returned.
test('listBugReports: server-side status filter + sort span the whole set (beyond the 100 cap)', () => {
  let now = 1000;
  const svc = new CommunityService({ db: openMemoryDb(), now: () => now++, reportLimit: 9999 });
  for (let i = 0; i < 150; i++) svc.createBugReport({ title: 'r' + i, key: 'k' });
  for (let id = 1; id <= 5; id++) svc.setBugStatus(id, 'fixed'); // the five OLDEST reports

  assert.equal(svc.listBugReports().length, 100, 'the page is capped at 100');
  assert.deepEqual(svc.listBugReports({ status: 'fixed', limit: 100 }).map((r) => r.id).sort((a, b) => a - b), [1, 2, 3, 4, 5],
    'the filter spans the whole set, not only the newest 100');
  assert.equal(svc.listBugReports({ status: 'all', limit: 500 }).length, 150, 'all / unknown status = every report');
  assert.equal(svc.listBugReports({ status: 'bogus', limit: 500 }).length, 150, 'an unknown status is not a filter');
  assert.deepEqual(svc.bugReportCounts(), { new: 145, triaged: 0, fixed: 5, total: 150 });

  // sort: 'status' (default) is 未处理优先 + 新→旧; 'newest' / 'oldest' are pure time (the 已修复 rows included).
  const def = svc.listBugReports({ limit: 500 });
  assert.equal(def[0].id, 150, 'default: the newest 待处理 leads');
  assert.equal(def[def.length - 1].id, 1, 'the 已修复 reports trail, 新→旧 inside the group');
  assert.deepEqual(svc.listBugReports({ sort: 'oldest', limit: 3 }).map((r) => r.id), [1, 2, 3]);
  assert.deepEqual(svc.listBugReports({ sort: 'newest', limit: 3 }).map((r) => r.id), [150, 149, 148]);
  assert.equal(svc.listBugReports({ sort: 'bogus', limit: 1 })[0].id, 150, 'an unknown sort falls back to status');
});

test('bugReportsToCsv / bugReportsExport: BOM, RFC-4180 quoting, formula defusing, identity only', () => {
  const list = [
    { id: 1, status: 'new', submitter: 'Reporter', created_at: Date.UTC(2026, 9, 9, 1, 2, 3), title: 'a, "b"', body: 'line1\nline2', images: [{ id: 9 }, { id: 10 }] },
    { id: 2, status: 'fixed', submitter: null, created_at: null, title: '=SUM(A1:A2)', body: '', images: [] },
  ];
  const csv = bugReportsToCsv(list);
  assert.equal(csv.charCodeAt(0), 0xfeff, 'a UTF-8 BOM so Excel opens Chinese');
  const lines = csv.slice(1).replace(/\r\n$/, '').split('\r\n');
  assert.equal(lines[0], 'id,status,submitter,created,title,body,images');
  assert.equal(lines[1], '1,new,Reporter,2026-10-09T01:02:03.000Z,"a, ""b""","line1\nline2",2', 'quotes doubled, embedded newline kept');
  assert.equal(lines[2], "2,fixed,,,'=SUM(A1:A2),,0", 'a leading = is defused with a quote, an empty cell is blank');

  const ex = bugReportsExport(list, { status: 'fixed', sort: 'bogus' });
  assert.deepEqual(ex, {
    status: 'fixed', sort: 'status', count: 2,
    reports: [
      { id: 1, status: 'new', submitter: 'Reporter', created: '2026-10-09T01:02:03.000Z', title: 'a, "b"', body: 'line1\nline2', images: 2 },
      { id: 2, status: 'fixed', submitter: null, created: null, title: '=SUM(A1:A2)', body: '', images: 0 },
    ],
  });
  assert.deepEqual(Object.keys(ex.reports[0]).sort(), ['body', 'created', 'id', 'images', 'status', 'submitter', 'title'], 'identity fields only — no accountId');
});

// The token-gated export + the page's new controls (docs/MATCHMAKING.md §36.3). Images stay on /admin/api/bug/image.
test('HTTP: admin bug export (JSON / CSV) + the page filter / sort / viewer controls', async () => {
  const dir = tmp();
  const srv = await startServer({ port: 0, quiet: true, accounts: true, db: openMemoryDb(), adminToken: 'tok', uploadDir: dir });
  try {
    const base = `http://localhost:${srv.port}`;
    const acc = srv.auth.register('Reporter', 'secret1');
    const session = { accountId: acc.account.id, limitKey: null, playerId: 'p_test', name: 'Reporter' };
    srv.lobby.bugReport(session, { title: '=A1', body: 'b, "q"' });
    srv.lobby.bugReport(session, { title: 'second' });

    assert.equal((await fetch(`${base}/admin/api/bug/export?format=json`)).status, 403, 'token required');
    const jr = await fetch(`${base}/admin/api/bug/export?format=json&token=tok`);
    assert.equal(jr.status, 200);
    assert.match(jr.headers.get('content-disposition'), /attachment; filename="bug-reports\.json"/);
    const j = await jr.json();
    assert.equal(j.count, 2);
    assert.equal(j.sort, 'status');
    assert.equal(j.status, null);
    assert.equal((await (await fetch(`${base}/admin/api/bug/export?token=tok`)).json()).count, 2, 'JSON is the default format');
    assert.equal((await (await fetch(`${base}/admin/api/bug/export?format=json&status=fixed&token=tok`)).json()).count, 0, 'the filter reaches the export');
    assert.equal((await (await fetch(`${base}/admin/api/bug/export?format=json&status=new&token=tok`)).json()).count, 2);

    const cr = await fetch(`${base}/admin/api/bug/export?format=csv&token=tok`);
    assert.equal(cr.status, 200);
    assert.match(cr.headers.get('content-type'), /text\/csv/);
    assert.match(cr.headers.get('content-disposition'), /bug-reports\.csv/);
    const buf = Buffer.from(await cr.arrayBuffer());
    assert.deepEqual([buf[0], buf[1], buf[2]], [0xef, 0xbb, 0xbf], 'UTF-8 BOM bytes');
    const csv = buf.toString('utf8');
    assert.match(csv, /^\uFEFFid,status,submitter,created,title,body,images\r\n/);
    assert.match(csv, /'=A1/, 'the formula-looking title is defused');
    assert.match(csv, /"b, ""q"""/, 'player text with a comma / quote is RFC-4180 quoted');

    const html = await (await fetch(`${base}/admin?token=tok`)).text();
    for (const needle of ['id="bugFilters"', 'data-sort="oldest"', 'id="bugExportJson"', 'id="bugExportCsv"', 'id="viewer"', 'id="viewerClose"', '/admin/api/bug/image/']) {
      assert.ok(html.includes(needle), `the page carries ${needle}`);
    }
  } finally {
    await srv.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
