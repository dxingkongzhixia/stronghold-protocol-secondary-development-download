// test/ui/ui-theme.test.js — official UI theme packs (shared/uiTheme.js): the 规程 key visual and red accent, applied
// only for the version id; the default 盟约 UI has no theme. tools/theme-template.mjs --check validates the registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI_THEMES, uiThemeForVersion } from '../../shared/uiTheme.js';
import { uiThemeAttr } from '../../public/js/uiTheme.js';
import { checkThemes, themeTemplate } from '../../tools/theme-template.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('规程 selects its theme; the default 盟约 data selects none', () => {
  const theme = uiThemeForVersion('act3autochess@V3_1');
  assert.equal(theme.id, 'act3autochess');
  assert.ok(existsSync(path.join(ROOT, 'public', theme.art.replace(/^\//, ''))), 'the key visual is in public/');
  assert.equal(uiThemeAttr('act3autochess@V3_1'), 'act3autochess');
  assert.equal(uiThemeAttr('act2autochess'), '');
  assert.equal(uiThemeAttr(null), '');
  assert.equal(uiThemeForVersion('act2autochess'), null);
});

test('the registry and the CSS agree (theme-template --check)', () => {
  assert.deepEqual(checkThemes(), []);
  const r = spawnSync(process.execPath, ['tools/theme-template.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /ok: \d+ UI theme\(s\) checked/);
});

test('the template scans the version\'s extracted theme / activity assets', () => {
  const t = themeTemplate('act3autochess@V3_1');
  assert.equal(t.id, 'act3autochess');
  assert.equal(t.version, 'act3autochess@V3_1');
  assert.equal(t.art, UI_THEMES.act3autochess.art);
  assert.ok(t.assets.length > 100, `${t.assets.length} images`);
});
