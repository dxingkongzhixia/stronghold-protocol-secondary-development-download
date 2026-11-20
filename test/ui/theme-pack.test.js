// test/ui/theme-pack.test.js — the local theme-pack manifest (shared/themePack.js, spTheme/1): the format, ids, colours
// (the same grammar as a cosmetic plugin's theme vars), picture paths, slices, and the CSS variables the browser writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateThemePack, themePackVariables, THEME_PACK_FORMAT } from '../../shared/themePack.js';
import { readThemePack } from '../../public/js/themePacks.js';

const base = (over = {}) => ({ format: THEME_PACK_FORMAT, id: 'my-theme', name: 'My Theme', ...over });

test('a valid pack: colours, image slots, slices, optional author/description', () => {
  const r = validateThemePack(base({
    author: 'me', description: 'hello', version: 2,
    colors: { accent: '#ff8800', bg0: 'rgb(10, 12, 11)', text: 'hsl(120 20% 90%)' },
    images: { 'title.bg': 'bg/title.webp', 'shop.card': 'shop/card.png', 'character.image': 'char/portrait.webp' },
    voice: 'voice/hello.ogg',
    slices: { 'shop.card': { inset: 18 } },
  }), new Set(['bg/title.webp', 'shop/card.png', 'char/portrait.webp', 'voice/hello.ogg']));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.pack.id, 'my-theme');
  assert.equal(r.pack.colors.accent, '#ff8800');
  assert.deepEqual(r.pack.slices['shop.card'], { inset: 18 });
});

test('ids, format and names are checked', () => {
  assert.equal(validateThemePack({ ...base(), format: 'spTheme/2' }).ok, false);
  assert.equal(validateThemePack({ ...base(), id: 'Bad ID' }).ok, false);
  assert.equal(validateThemePack({ ...base(), name: '' }).ok, false);
  assert.equal(validateThemePack(null).ok, false);
});

test('colours use the cosmetic-plugin grammar; an unknown key is only a warning', () => {
  assert.equal(validateThemePack(base({ colors: { accent: 'url(https://x)' } })).ok, false);
  assert.equal(validateThemePack(base({ colors: { accent: 'red' } })).ok, false);
  const r = validateThemePack(base({ colors: { accent: '#0f0', nope: '#fff' } }));
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 1);
});

test('picture paths stay inside the pack: no URL, no .., image extensions only', () => {
  for (const bad of ['https://x/y.png', '../x.png', '/abs.png', 'x.css', 'x.svg', 'a/../b.png']) {
    assert.equal(validateThemePack(base({ images: { 'title.bg': bad } })).ok, false, bad);
  }
  assert.equal(validateThemePack(base({ images: { 'title.bg': 'bg/title.PNG' } }), new Set(['bg/title.PNG'])).ok, true);
});

test('a referenced picture must exist when the file list is known', () => {
  const r = validateThemePack(base({ images: { 'lobby.bg': 'bg/lobby.webp' } }), new Set());
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, 'THEME_IMAGE_MISSING');
});

test('readThemePack: a folder input strips its root and finds theme.json at any depth', async () => {
  const doc = JSON.stringify(base({ colors: { accent: '#0f0' }, images: { 'title.bg': 'bg/title.png' } }));
  const mk = (path, body, type) => {
    const f = new File([body], path.split('/').pop(), { type });
    Object.defineProperty(f, 'webkitRelativePath', { value: path });
    return f;
  };
  const files = [
    mk('my-theme/theme.json', doc, 'application/json'),
    mk('my-theme/bg/title.png', new Uint8Array([1, 2, 3]), 'image/png'),
  ];
  const r = await readThemePack(files);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.pack.id, 'my-theme');
  assert.deepEqual(Object.keys(r.blobs), ['bg/title.png']);
});

test('themePackVariables: colours map to design tokens, pictures (character too) to blob URLs, slice to its variable', () => {
  const pack = validateThemePack(base({
    colors: { accent: '#ff8800', text: '#ffffff' },
    images: { 'title.bg': 'bg/title.webp', 'character.image': 'char/portrait.webp' },
    slices: { 'shop.card': { inset: 20 } },
  }), new Set(['bg/title.webp', 'char/portrait.webp'])).pack;
  const vars = themePackVariables(pack, (p) => `blob:${p}`);
  assert.equal(vars['--mint-500'], '#ff8800');
  assert.equal(vars['--text-hi'], '#ffffff');
  assert.equal(vars['--tp-title-bg'], 'url("blob:bg/title.webp")');
  assert.equal(vars['--tp-character'], 'url("blob:char/portrait.webp")');
  assert.equal(vars['--tp-shop-card-slice'], '20');
});

test('readThemePack: a Spine character and its atlas page are kept beside the pictures', async () => {
  const doc = JSON.stringify(base({
    character: { skel: 'char/model.skel', atlas: 'char/model.atlas', idle: 'Idle' },
    voice: 'voice/hello.ogg',
  }));
  const mk = (path, body, type) => {
    const f = new File([body], path.split('/').pop(), { type });
    Object.defineProperty(f, 'webkitRelativePath', { value: path });
    return f;
  };
  const r = await readThemePack([
    mk('pack/theme.json', doc, 'application/json'),
    mk('pack/char/model.skel', new Uint8Array([1, 2, 3]), 'application/octet-stream'),
    mk('pack/char/model.atlas', 'model.png\nsize: 4,4\n', 'text/plain'),
    mk('pack/char/model.png', new Uint8Array([1]), 'image/png'),
    mk('pack/voice/hello.ogg', new Uint8Array([1]), 'audio/ogg'),
  ]);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  for (const p of ['char/model.skel', 'char/model.atlas', 'char/model.png', 'voice/hello.ogg']) assert.ok(r.blobs[p], p);
});

test('a voice line is an audio path inside the pack', () => {
  assert.equal(validateThemePack(base({ voice: 'voice/hello.ogg' }), new Set(['voice/hello.ogg'])).ok, true);
  assert.equal(validateThemePack(base({ voice: 'voice/hello.mp3' })).ok, true);
  assert.equal(validateThemePack(base({ voice: 'https://x/a.ogg' })).ok, false);
  assert.equal(validateThemePack(base({ voice: 'voice/hello.wav' })).ok, false);
  assert.equal(validateThemePack(base({ voice: 'voice/hello.ogg' }), new Set()).ok, false);
});
