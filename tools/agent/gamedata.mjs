// tools/agent/gamedata.mjs — small, public metadata for the agent's state prompt.
//
// The private view identifies shop / hand / board pieces only by id. A model cannot choose well from "chess_char_1_01_a".
// This module reads the checkout's generated data (the same names, tiers, positions and bonds the shop cards show) and
// adds them to the prompt. It never reads match state, RNG or another seat's private view.
//
// A remote agent without data/ keeps working: every describe* returns the id with null metadata.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let cache = null;

function readJson(file) {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; } catch { return null; }
}

/** @param {{ root?: string }} [opts] */
export function loadMeta({ root = ROOT } = {}) {
  if (cache && cache.root === root) return cache;
  cache = {
    root,
    chess: readJson(path.join(root, 'data', 'chess.json')) || {},
    bonds: readJson(path.join(root, 'data', 'bonds.json')) || {},
    bands: readJson(path.join(root, 'data', 'bands.json')) || {},
  };
  return cache;
}

/** One chess piece's public card metadata (shop cards show all of this). */
export function describeChess(id, { root } = {}) {
  const meta = loadMeta(root ? { root } : undefined);
  const c = meta.chess[id];
  if (!c) return { id };
  const bonds = (c.bonds || []).map((b) => (meta.bonds[b] && meta.bonds[b].name) || b);
  return {
    id, name: c.name || id, tier: c.tier ?? null, rarity: c.rarity ?? null,
    position: c.position || null, profession: c.subProfessionName || c.profession || null, bonds,
  };
}

/** A shop / hand / board entry: chess gets its card metadata; items and tokens keep their id + kind. */
export function describePiece(p, opts) {
  if (!p || typeof p !== 'object') return p;
  const base = { id: p.id, kind: p.kind };
  if (p.kind && p.kind !== 'chess') return base;
  return { ...base, ...describeChess(p.id, opts) };
}

/** A band's public choice metadata (name, starting HP, its permanent rule). */
export function describeBand(id, { root } = {}) {
  const meta = loadMeta(root ? { root } : undefined);
  const b = meta.bands[id];
  if (!b) return { id };
  return {
    id, name: b.name || id, totalHp: b.totalHp ?? null,
    effect: b.desc || b.effectName || null,
  };
}
