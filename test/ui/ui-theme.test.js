// test/ui/ui-theme.test.js — official UI theme packs (shared/uiTheme.js). No version ships one today: 规程·序列Ⅰ uses
// the 盟约 look (owner 2026-11-17), so every version maps to no attribute. The mechanism, its CSS and the asset
// template stay ready for a future theme; tools/theme-template.mjs --check validates a registered one.
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

test('no version ships a theme: 规程 and 盟约 both keep the default tokens', () => {
  assert.deepEqual(Object.keys(UI_THEMES), []);
  assert.equal(uiThemeForVersion('act3autochess@V3_1'), null);
  assert.equal(uiThemeForVersion('act2autochess'), null);
  assert.equal(uiThemeAttr('act3autochess@V3_1'), '');
  assert.equal(uiThemeAttr('act2autochess'), '');
  assert.equal(uiThemeAttr(null), '');
});

test('the registry and the CSS agree (theme-template --check)', () => {
  assert.deepEqual(checkThemes(), []);
  const r = spawnSync(process.execPath, ['tools/theme-template.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /ok: 0 UI theme\(s\) checked/);
});

test('the template scans the version\'s extracted theme / activity assets', () => {
  const t = themeTemplate('act3autochess@V3_1');
  assert.equal(t.id, 'act3autochess');
  assert.equal(t.version, 'act3autochess@V3_1');
  assert.ok(t.art && existsSync(path.join(ROOT, 'public', t.art.replace(/^\//, ''))), 'the key visual is extracted');
  assert.ok(t.assets.length > 100, `${t.assets.length} images`);
});
