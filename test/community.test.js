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
import { CommunityService, sanitizeText, sniffImageType, parseChangelogMarkdown } from '../server/community.js';
import { validateC2S } from '../shared/protocol.js';
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

test('db migration v3: the community tables exist', () => {
  const db = openMemoryDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  for (const t of ['changelog', 'bug_reports', 'bug_uploads']) assert.ok(tables.includes(t), `${t} exists`);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
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

  const md = '## 9.9.9 — 2030-01-01\nseed';
  assert.deepEqual(svc.importChangelogMarkdown(md), { ok: true, imported: 0, skipped: true }, 'a non-empty table is not re-seeded');
  assert.equal(svc.changelogCount(), 3);
  const fresh = new CommunityService({ db: openMemoryDb() });
  assert.deepEqual(fresh.importChangelogMarkdown(md), { ok: true, imported: 1, skipped: false });
  assert.equal(fresh.listChangelog()[0].version, '9.9.9');
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
    assert.equal(clog.changelog[0].version, '0.2.0', 'newest first');

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

    const post = (body) => fetch(`${base}/admin/api/bug/status?token=tok`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ id: st.bugs[0].id, status: 'fixed' })).status, 200);
    assert.equal((await (await fetch(`${base}/admin/api/state?token=tok`)).json()).bugs[0].status, 'fixed');
    assert.equal((await post({ id: st.bugs[0].id, status: 'nope' })).status, 400);
  } finally {
    await srv.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
