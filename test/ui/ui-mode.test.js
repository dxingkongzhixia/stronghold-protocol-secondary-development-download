// Main-interface switch (docs/UI-HUB.md): the server stores the operator's choice outside the code tree and serves it
// as /ui-config.js; the client imports exactly one lobby. These tests cover the pure selection/storage pieces and the
// source-level guarantees that both interfaces keep shipping (the browser flows are covered by the Hub screenshots and
// the existing lobby/store suites).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_UI_MODE, UI_MODES, readStoredUiMode, readUiMode, writeUiMode, uiConfigScript,
} from '../../server/uiMode.js';
import {
  parseUiMode as clientParseUiMode, previewUiMode, serverUiMode, effectiveUiMode, DEFAULT_UI_MODE as CLIENT_DEFAULT,
} from '../../public/js/ui/uiMode.js';

describe('server/uiMode.js: stored switch', () => {
  test('a fresh install defaults to the Hub interface', () => {
    assert.equal(DEFAULT_UI_MODE, 'hub');
    assert.deepEqual(UI_MODES, ['hub', 'classic']);
    const root = mkdtempSync(join(tmpdir(), 'sp-ui-'));
    try {
      assert.equal(readStoredUiMode(root), null);
      assert.equal(readUiMode(root), 'hub');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('writes are atomic, validated and survive a re-read', () => {
    const root = mkdtempSync(join(tmpdir(), 'sp-ui-'));
    try {
      assert.equal(writeUiMode(root, 'classic'), 'classic');
      assert.equal(readStoredUiMode(root), 'classic');
      assert.equal(readUiMode(root), 'classic');
      assert.equal(writeUiMode(root, 'hub'), 'hub');
      assert.equal(readUiMode(root), 'hub');
      assert.equal(writeUiMode(root, 'nope'), null, 'an unknown mode is refused, not silently stored');
      assert.equal(readUiMode(root), 'hub', 'and the previous choice stays');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('a corrupt file falls back to the default instead of failing the server', () => {
    const root = mkdtempSync(join(tmpdir(), 'sp-ui-'));
    try {
      writeUiMode(root, 'classic');
      const file = join(root, 'var', 'ui.json');
      // simulate a half-written / hand-edited file
      writeFileSync(file, '{not json', 'utf8');
      assert.equal(readStoredUiMode(root), null);
      assert.equal(readUiMode(root), 'hub');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('the served script carries only the mode, never a token or a path', () => {
    assert.equal(uiConfigScript('classic'), 'window.__SP_UI__ = {"main":"classic"};\n');
    assert.equal(uiConfigScript('hub'), 'window.__SP_UI__ = {"main":"hub"};\n');
    assert.equal(uiConfigScript('bogus'), 'window.__SP_UI__ = {"main":"hub"};\n');
  });
});

describe('public/js/ui/uiMode.js: client selection', () => {
  test('parse accepts exactly hub / classic', () => {
    assert.equal(clientParseUiMode('hub'), 'hub');
    assert.equal(clientParseUiMode('classic'), 'classic');
    assert.equal(clientParseUiMode(''), null);
    assert.equal(clientParseUiMode(null), null);
    assert.equal(clientParseUiMode('HUB'), null);
  });

  test('?ui= is a one-shot preview and wins over the server mode', () => {
    const previous = globalThis.__SP_UI__;
    try {
      globalThis.__SP_UI__ = { main: 'classic' };
      assert.equal(serverUiMode(), 'classic');
      assert.equal(previewUiMode('?ui=hub'), 'hub');
      assert.equal(effectiveUiMode(), 'classic', 'no query → the server choice');
      assert.equal(previewUiMode('?ui=nope'), null);
      // effectiveUiMode reads location.search; the preview function is pure and is what main.js uses through it
      assert.equal(previewUiMode('?room=ABCD&ui=classic'), 'classic');
    } finally {
      if (previous === undefined) delete globalThis.__SP_UI__; else globalThis.__SP_UI__ = previous;
    }
  });

  test('a missing or broken server payload falls back to hub', () => {
    const previous = globalThis.__SP_UI__;
    try {
      delete globalThis.__SP_UI__;
      assert.equal(serverUiMode(), 'hub');
      assert.equal(CLIENT_DEFAULT, 'hub');
      globalThis.__SP_UI__ = { main: 'something-else' };
      assert.equal(serverUiMode(), 'hub');
    } finally {
      if (previous === undefined) delete globalThis.__SP_UI__; else globalThis.__SP_UI__ = previous;
    }
  });
});

describe('both main interfaces keep shipping', () => {
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  test('the classic lobby and the Hub lobby both exist and export LobbyScreen', () => {
    assert.match(read('public/js/screens/lobby.js'), /export function LobbyScreen\(/);
    assert.match(read('public/js/screens/hub/lobby.js'), /export function LobbyScreen\(/);
  });
  test('main.js chooses one lobby at boot instead of always importing the classic one', () => {
    const main = read('public/js/main.js');
    assert.match(main, /effectiveUiMode\(\)/);
    assert.match(main, /import\('\.\/screens\/hub\/lobby\.js'\)/);
    assert.match(main, /import\('\.\/screens\/lobby\.js'\)/);
  });
  test('index.html loads the switch before the module entry and ships the Hub styles', () => {
    const html = read('public/index.html');
    assert.ok(html.indexOf('/ui-config.js') < html.indexOf('src="/js/main.js"'), 'the switch is read before the module entry');
    assert.match(html, /\/css\/screens\/hub\.css/);
  });
});
