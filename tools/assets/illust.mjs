// tools/assets/illust.mjs — the seat-card full-body art (owner 2026-10-24): resize a downloaded official illustration
// to the card's WebP size. The plan (`char/illust/<charId>.webp`) points at the PNG dump (Aceship); fetch-assets writes
// the PNG bytes there, this module re-encodes them in place. `tools/illust.mjs` uses the same converter for a fetch
// that does not run the whole pipeline. Pillow (Python) is the only image dependency; without it the caller drops the
// file so the manifest omits the artwork and the card falls back to `portraitE2` / `portrait`.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The output's maximum height (CSS px at 1x; the card is ~400–500 px, so this is crisp at 2x). */
export const ILLUST_MAX_HEIGHT = 1100;

const PYTHON = `
import json, os, sys
from PIL import Image
max_h = int(sys.argv[2]) if len(sys.argv) > 2 else 1100
for item in json.load(open(sys.argv[1])):
    src, dst = item
    try:
        im = Image.open(src).convert('RGBA')
        w, h = im.size
        if h > max_h:
            w = max(1, round(w * max_h / h))
            h = max_h
            im = im.resize((w, h), Image.LANCZOS)
        tmp = dst + '.tmp'
        im.save(tmp, 'WEBP', quality=88, method=6)
        os.replace(tmp, dst)
    except Exception as e:
        print('ERR ' + src + ': ' + str(e))
`;

/** True when the file is a WebP (`RIFF....WEBP`). */
export function isWebp(file) {
  try {
    const b = readFileSync(file);
    return b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP';
  } catch { return false; }
}

/**
 * Convert PNG sources to WebP destinations (in place when src === dst), resizing to `maxHeight`.
 * @param {{ src: string, dst: string }[]} jobs
 * @param {{ log?: (line: string) => void, maxHeight?: number, python?: string }} [o]
 * @returns {{ converted: string[], failed: string[] }} absolute destinations
 */
export function convertIllust(jobs, { log = () => {}, maxHeight = ILLUST_MAX_HEIGHT, python = process.env.SP_PYTHON || 'python' } = {}) {
  const list = (Array.isArray(jobs) ? jobs : []).filter((j) => j && existsSync(j.src));
  const todo = list.filter((j) => j.src === j.dst ? !isWebp(j.src) : true);
  if (!todo.length) return { converted: [], failed: [] };
  const dir = path.join(os.tmpdir(), `sp-illust-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const script = path.join(dir, 'convert.py');
  const data = path.join(dir, 'jobs.json');
  writeFileSync(script, PYTHON);
  writeFileSync(data, JSON.stringify(todo.map((j) => [j.src, j.dst])));
  const run = (cmd) => spawnSync(cmd, [script, data, String(maxHeight)], { encoding: 'utf8', timeout: 30 * 60 * 1000 });
  let r = run(python);
  if (r.error || r.status !== 0) r = run(python === 'python' ? 'python3' : python);
  if (r.stdout) for (const line of String(r.stdout).split('\n')) if (line.startsWith('ERR ')) log(line);
  if (r.error || r.status !== 0) log(`[illust] Pillow conversion unavailable (${r.error?.message || r.stderr || r.status})`);
  const converted = [];
  const failed = [];
  for (const j of todo) {
    if (isWebp(j.dst)) converted.push(j.dst);
    else { failed.push(j.dst); try { unlinkSync(j.dst); } catch { /* already gone */ } }
  }
  return { converted, failed };
}
