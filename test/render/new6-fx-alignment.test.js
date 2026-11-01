// Official prefab alignment for the 2026-11-01 additions: every skill of the new operators must have an index entry,
// fx keys that resolve to extracted prefabs, and (when the local fx manifest is present) files on disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const IDX = path.join(ROOT, 'public', 'assets', 'local', 'fx', 'index.json');
const skip = fs.existsSync(IDX) ? false : 'local fx index not extracted';

const OPS = {
  char_4182_oblvns: ['skchr_oblvns_1', 'skchr_oblvns_2', 'skchr_oblvns_3'],
  char_4244_tocka: ['skchr_tocka_1', 'skchr_tocka_2', 'skchr_tocka_3'],
  char_4247_oxi: ['skchr_oxi_1', 'skchr_oxi_2', 'skchr_oxi_3'],
};

test('official prefab alignment: new operators have units, skills, effect keys and prefab files', { skip }, () => {
  const idx = JSON.parse(fs.readFileSync(IDX, 'utf8'));
  for (const [charId, skills] of Object.entries(OPS)) {
    assert.ok(idx.units[charId], `${charId}: unit`);
    for (const sk of skills) {
      const rec = idx.skills[sk];
      assert.ok(rec, `${sk}: index entry`);
      const keys = new Set([...(rec.effects || [])]);
      for (const u of rec.uses || []) for (const k of u.keys || []) keys.add(k);
      for (const k of keys) {
        const entry = idx.prefabs?.[k];
        assert.ok(entry?.file, `${sk}: prefab index entry ${k}`);
        assert.ok(fs.existsSync(path.join(ROOT, 'public', 'assets', 'local', 'fx', entry.file)), `${sk}: prefab ${entry.file}`);
      }
    }
  }
});
