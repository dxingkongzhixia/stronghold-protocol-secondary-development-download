// test/ui/prep-frames.test.js — a prep board must never take a battle frame (game.js).
//
// Battle and prep share the field id `n:<playerId>` (server/match/match/combat.js `_ccField` and views.js `prepFieldMeta`),
// while prep pieces carry uids in the same small integer space as battle unit ids. A late `b.ev` ['skill', id, 1] from the
// round's tail therefore used to start a skill aura on an operator standing in 修整期 (and a replay of the buffered
// events did the same). The screen now marks the prep board and drops every battle frame/replay while it is shown.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const game = readFileSync(path.join(ROOT, 'public/js/screens/game.js'), 'utf8');

test('prep board: battle snapshots and events are dropped while a prep board is shown', () => {
  assert.match(game, /const prepShownRef = useRef\(false\)/);
  // the own prep (setPrep path) and the scouted prep (enterBattle path) both mark it
  assert.match(game, /if \(showPrep\) \{\n\s+prepShownRef\.current = true;/);
  assert.match(game, /prepShownRef\.current = !!field\.prep;/);
  // onSnap / onEv bail out before touching the view
  assert.match(game, /if \(prepShownRef\.current\) return; \/\/ a prep board takes no battle snapshot/);
  assert.match(game, /if \(prepShownRef\.current\) return; \/\/ a prep board takes no battle event/);
});

test('prep board: the buffered battle events and snapshot are not replayed on it', () => {
  assert.match(game, /const early = field\.prep \? null : buffered;/);
  assert.match(game, /const earlySnap = field\.prep \? null : bufferedSnap;/);
  // a prep meta clears the marker for the next battle meta (onFieldMeta sets it from msg.prep)
  assert.match(game, /prepShownRef\.current = !!msg\.prep;/);
});
