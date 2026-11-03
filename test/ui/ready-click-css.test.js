// 准备就绪 点不到 (community report 2026-11-03, co-op): the bond strip's full-width box must never take the pointer.
// game.css declares `.gm__bonds { pointer-events: none }` early, but its tail repeats `.gm__hud > * { pointer-events: auto }`
// (equal specificity, later in the file) — that handed the strip back the pointer and it swallowed clicks in its band,
// the top bar's 准备就绪 button among them (Space still worked: the shortcut does not go through the DOM). The discs
// alone stay clickable. This guards the cascade, not just the rule's presence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CSS = readFileSync(path.join(ROOT, 'public/css/screens/game.css'), 'utf8');

/** The last `index` of a declaration of `prop` in the last rule whose selector list is exactly `sel`. */
function lastRule(src, sel) {
  const re = new RegExp(`(^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g');
  let last = null;
  for (let m; (m = re.exec(src));) last = { at: m.index, body: m[2] };
  return last;
}

test('the bond strip never takes the pointer: its last pointer-events rule is none and wins the cascade', () => {
  const hud = lastRule(CSS, '.gm__hud > *');
  const bonds = lastRule(CSS, '.gm__bonds');
  assert.ok(hud && bonds, 'both rules exist');
  assert.match(bonds.body, /pointer-events:\s*none/, 'the strip is pointer-transparent');
  assert.ok(bonds.at > hud.at, 'the strip rule comes after the HUD block (equal specificity: source order decides)');
});

test('the bond discs (and the +N chip) stay clickable', () => {
  const discs = lastRule(CSS, '.gm__bonds .bslot, .gm__bonds .bstrip__more');
  assert.ok(discs, 'the disc rule exists');
  assert.match(discs.body, /pointer-events:\s*auto/);
});
