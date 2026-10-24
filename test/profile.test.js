// The account profile (schema v6, owner 2026-10-24): the seat card's default 立绘 and the uploaded avatar. Covers the
// DB migration, AuthService, the lobby's room.setArt / account.setArt and the HTTP avatar route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openMemoryDb } from '../server/db.mjs';
import { AuthService } from '../server/auth.js';
import { startServer } from '../server/index.js';
import { TestClient } from './helpers/wsClient.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const ART = 'char_003_kalts';

test('schema v6: accounts carry art and avatar', () => {
  const db = openMemoryDb();
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 6);
  const cols = db.prepare('PRAGMA table_info(accounts)').all().map((c) => c.name);
  assert.ok(cols.includes('art') && cols.includes('avatar'));
});

test('AuthService: setArt / setAvatar persist and a default account keeps the old public shape', () => {
  const auth = new AuthService({ db: openMemoryDb() });
  const r = auth.register('ArtUser', 'secret1');
  assert.deepEqual(auth.resolve(r.token), { id: r.account.id, name: 'ArtUser', role: null }, 'nothing added for a fresh account');
  assert.deepEqual(auth.setArt(r.account.id, ART), { id: r.account.id, name: 'ArtUser', role: null, art: ART });
  assert.deepEqual(auth.resolve(r.token), { id: r.account.id, name: 'ArtUser', role: null, art: ART }, 'the session reads it back');
  const avatar = `${'ab'.repeat(16)}.png`;
  assert.deepEqual(auth.setAvatar(r.account.id, avatar), { id: r.account.id, name: 'ArtUser', role: null, art: ART, avatar });
  assert.deepEqual(auth.setArt(r.account.id, null), { id: r.account.id, name: 'ArtUser', role: null, avatar });
  assert.deepEqual(auth.setAvatar(r.account.id, null), { id: r.account.id, name: 'ArtUser', role: null }, 'cleared');
});

test('room.setArt: a known operator shows on the seat, an unknown one is refused, save=true is the account default', async () => {
  const srv = await startServer({ port: 0, quiet: true, accounts: true, db: openMemoryDb() });
  const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
  try {
    await c.hello('ArtUser');
    await c.request({ t: 'auth.register', name: 'ArtUser', password: 'secret1' });
    const authOk = await c.waitFor('auth.ok');
    const token = authOk.token;
    await c.request({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    await c.waitFor('room.state', (s) => s.seats?.[0]);
    const ok = await c.request({ t: 'room.setArt', art: ART, save: true });
    assert.equal(ok.t, 'ok');
    const state = await c.waitFor('room.state', (s) => s.seats?.[0]?.art === ART);
    assert.equal(state.seats[0].art, ART);
    const prof = await c.waitFor('auth.profile');
    assert.equal(prof.account.art, ART, 'saved as the account default');
    const bad = await c.request({ t: 'room.setArt', art: 'char_999_nope' });
    assert.equal(bad.t, 'error', 'an operator the installation has no art for is refused');

    // a later room starts with the saved default
    await c.request({ t: 'room.leave' });
    await c.request({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    const again = await c.waitFor('room.state', (s) => s.seats?.[0]?.art === ART);
    assert.equal(again.seats[0].art, ART, 'the default applies when the seat is created');
    await c.close();

    // a reconnect carrying the account token keeps it too
    const c2 = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    try {
      await c2.hello('ArtUser', undefined, { accountToken: token });
      const auth2 = await c2.waitFor('auth.ok');
      assert.equal(auth2.account.art, ART);
    } finally { await c2.close(); }
  } finally {
    await srv.close();
  }
});

test('room.setArt: a guest gets the seat art for the session but no stored default; logout clears it', async () => {
  const srv = await startServer({ port: 0, quiet: true, accounts: true, db: openMemoryDb() });
  const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
  try {
    await c.hello('GuestArt');
    await c.request({ t: 'room.create', mode: 'solo', difficulty: 'NORMAL' });
    await c.waitFor('room.state', (s) => s.seats?.[0]);
    await c.request({ t: 'room.setArt', art: ART });
    const state = await c.waitFor('room.state', (s) => s.seats?.[0]?.art === ART);
    assert.equal(state.seats[0].art, ART);
    await c.expectNone('auth.profile', () => true, 200);

    await c.request({ t: 'auth.register', name: 'LaterLogin', password: 'secret1' });
    await c.waitFor('auth.ok');
    await c.request({ t: 'room.setArt', art: ART, save: true });
    await c.waitFor('room.state', (s) => s.seats?.[0]?.art === ART);
    await c.request({ t: 'room.setArt', art: null, save: true });
    const prof = await c.waitFor('auth.profile', (m) => m.account && !m.account.art, 4000);
    assert.equal(prof.account.art, undefined, 'cleared back to the default look');
    await c.request({ t: 'room.leave' });
    c.clearInbox();
    await c.request({ t: 'room.create', mode: 'solo', difficulty: 'NORMAL' });
    const fresh = await c.waitFor('room.state', (s) => s.seats?.[0]);
    assert.equal(fresh.seats[0].art, undefined, 'the default look is an empty art');
  } finally {
    await c.close();
    await srv.close();
  }
});

test('account.setArt: the default can be set outside a room; guests are refused', async () => {
  const srv = await startServer({ port: 0, quiet: true, accounts: true, db: openMemoryDb() });
  const guest = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
  const user = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
  try {
    await guest.hello('NoAccount');
    const denied = await guest.request({ t: 'account.setArt', art: ART });
    assert.equal(denied.t, 'error');
    assert.equal(denied.code, 'AUTH_REQUIRED');

    await user.hello('DefaultUser');
    await user.request({ t: 'auth.register', name: 'DefaultUser', password: 'secret1' });
    const token = (await user.waitFor('auth.ok')).token;
    const ok = await user.request({ t: 'account.setArt', art: 'char_291_aglina' });
    assert.equal(ok.t, 'ok');
    const prof = await user.waitFor('auth.profile', (m) => m.account?.art === 'char_291_aglina', 4000);
    assert.equal(prof.account.art, 'char_291_aglina');
    const bad = await user.request({ t: 'account.setArt', art: 'char_999_nope' });
    assert.equal(bad.t, 'error');
    const back = await user.request({ t: 'account.setArt', art: null });
    assert.equal(back.t, 'ok');
    await user.waitFor('auth.profile', (m) => m.account && !m.account.art, 4000);
    assert.ok(token);
  } finally {
    await guest.close();
    await user.close();
    await srv.close();
  }
});

test('POST /api/account/avatar: auth, sniffing, immutable serving and DELETE', async () => {
  const srv = await startServer({ port: 0, quiet: true, accounts: true, db: openMemoryDb() });
  const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
  try {
    await c.hello('AvatarUser');
    await c.request({ t: 'auth.register', name: 'AvatarUser', password: 'secret1' });
    const token = (await c.waitFor('auth.ok')).token;
    await c.request({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    await c.waitFor('room.state', (s) => s.seats?.[0]);
    const post = (body, headers = {}) => fetch(`${srv.url}/api/account/avatar`, { method: 'POST', headers: { 'x-account-token': token, ...headers }, body });

    const noauth = await fetch(`${srv.url}/api/account/avatar`, { method: 'POST', body: PNG });
    assert.equal(noauth.status, 401, 'an account token is required');
    const notImage = await post(Buffer.from('<svg onload=alert(1)>'), { 'Content-Type': 'image/svg+xml' });
    assert.equal(notImage.status, 400, 'the bytes decide the type, not the header');

    const r = await post(PNG, { 'Content-Type': 'image/png' });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.match(j.avatar, /^[0-9a-f]{32}\.png$/);
    assert.equal(j.account.avatar, j.avatar);
    const img = await fetch(`${srv.url}/avatar/${j.avatar}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.match(img.headers.get('cache-control') || '', /immutable/);
    assert.equal(Buffer.from(await img.arrayBuffer()).length, PNG.length);
    assert.equal((await fetch(`${srv.url}/avatar/${'0'.repeat(32)}.png`)).status, 404);
    assert.equal((await fetch(`${srv.url}/avatar/not-a-file.png`)).status, 404);

    const prof = await c.waitFor('auth.profile', (m) => m.account?.avatar === j.avatar, 4000);
    assert.equal(prof.account.avatar, j.avatar, 'the live session is told');
    const seatState = await c.waitFor('room.state', (s) => s.seats?.[0]?.avatar === j.avatar, 4000);
    assert.equal(seatState.seats[0].avatar, j.avatar, 'and the seat other players see carries it');

    const del = await fetch(`${srv.url}/api/account/avatar`, { method: 'DELETE', headers: { 'x-account-token': token } });
    assert.equal(del.status, 200);
    assert.equal((await del.json()).avatar, null);
    const cleared = await c.waitFor('auth.profile', (m) => m.account && !m.account.avatar, 4000);
    assert.equal(cleared.account.avatar, null);
  } finally {
    await c.close();
    await srv.close();
  }
});

test('validateC2S: the art messages accept a charId or null and refuse anything else', async () => {
  const { validateC2S } = await import('../shared/protocol.js');
  assert.equal(validateC2S({ t: 'room.setArt', art: ART }), null);
  assert.equal(validateC2S({ t: 'room.setArt', art: null, save: true }), null);
  assert.equal(validateC2S({ t: 'room.setArt' }), null);
  assert.notEqual(validateC2S({ t: 'room.setArt', art: 'not a char' }), null);
  assert.equal(validateC2S({ t: 'account.setArt', art: ART }), null);
  assert.notEqual(validateC2S({ t: 'account.setArt', art: 'chess_char_1_01_a' }), null);
});
