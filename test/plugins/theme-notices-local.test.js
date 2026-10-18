// W1-lite (plan C): a plugin declares design tokens and plain-text notices; the manifest validates them and the
// catalogue carries them (the client applies the theme and lists the notices).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPluginManifest, pluginIndexEntry } from '../../shared/plugins/manifest.js';
import { readThemeDeclaration, THEME_TOKENS, THEME_VAR_LIMIT } from '../../shared/plugins/theme.js';
import { readNotices } from '../../shared/plugins/notices.js';

const TOKEN = Object.keys(THEME_TOKENS)[0];

const cosmetic = (over = {}) => ({
  manifest: 2, id: 'theme-demo', name: 'Theme demo', version: '1.0.0', app: '>=0.3.0 <0.5.0', api: 1,
  class: 'cosmetic', scope: ['room'], permissions: ['assets.override', 'theme'],
  ...over,
});

const read = (raw) => readPluginManifest(raw, { id: raw.id });

test('theme grammar: tokens are accepted, urls and unknown names refused', () => {
  assert.deepEqual(readThemeDeclaration({ vars: { [TOKEN]: '#123456' } }).problems, []);
  assert.equal(readThemeDeclaration({ vars: { [TOKEN]: '#123456' } }).vars[TOKEN], '#123456');
  assert.equal(readThemeDeclaration({ [TOKEN]: '#abcdef' }).vars[TOKEN], '#abcdef', 'a flat map of --tokens');
  const url = readThemeDeclaration({ vars: { [TOKEN]: 'url(x.png)' } });
  assert.equal(url.vars, null);
  assert.equal(url.problems[0].code, 'PLUGIN_THEME_URL');
  const unknown = readThemeDeclaration({ vars: { '--not-a-token': '#123456' } });
  assert.equal(unknown.problems[0].code, 'PLUGIN_THEME_NAME');
  // a value the token does not allow (the bg tokens take colours)
  const bad = readThemeDeclaration({ vars: { [TOKEN]: '12px' } });
  assert.equal(bad.vars, null);
  assert.equal(bad.problems[0].code, 'PLUGIN_THEME_VALUE');
  const tooMany = Object.fromEntries(Array.from({ length: THEME_VAR_LIMIT + 1 }, (_, i) => [`--bg-${i}`, '#123456']));
  assert.ok(readThemeDeclaration({ vars: tooMany }).problems.some((p) => p.code === 'PLUGIN_THEME_LIMIT'));
});

test('notices: a plain-text list, capped and shape-checked', () => {
  const ok = readNotices([{ id: 'welcome', title: 'Hi', body: 'A plain-text notice' }]);
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.notices[0].id, 'welcome');
  const bad = readNotices('nope');
  assert.equal(bad.notices, null);
  assert.equal(bad.problems[0].code, 'PLUGIN_NOTICE_SHAPE');
});

test('the manifest carries a theme and notices; the catalogue entry names them', () => {
  const raw = cosmetic({ theme: { vars: { [TOKEN]: '#123456' } }, notices: [{ id: 'welcome', title: 'Hi', body: 'A plain-text notice' }] });
  const r = read(raw);
  assert.deepEqual(r.problems, []);
  assert.equal(r.manifest.theme[TOKEN], '#123456');
  assert.equal(r.manifest.notices.length, 1);
  const entry = pluginIndexEntry({ id: raw.id, class: 'cosmetic', status: 'loaded', source: 'plugin', manifest: r.manifest });
  assert.equal(entry.theme.vars[TOKEN], '#123456');
  assert.equal(entry.notices[0].id, 'welcome');
});

test('a bad theme or notices keeps the plugin out (a problem, not a warning)', () => {
  const url = read(cosmetic({ theme: { vars: { [TOKEN]: 'url(x.png)' } } }));
  assert.equal(url.manifest, null);
  assert.ok(url.problems.some((p) => p.includes('URL')));
  const shape = read(cosmetic({ notices: 'nope' }));
  assert.equal(shape.manifest, null);
  assert.ok(shape.problems.some((p) => p.includes('notices')));
});
