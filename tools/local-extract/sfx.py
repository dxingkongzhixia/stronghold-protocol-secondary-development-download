#!/usr/bin/env python3
"""Extract the battle sound effects (SFX) of the locally installed Arknights client (optional, host-side).

The official client keeps every unit sound effect inside a handful of Unity AssetBundles, one AudioClip each:
`<client>/Arknights_Data/StreamingAssets/AB/Windows/audio/sound_beta_2/player/p_atk_5.ab` holds 180 clips named
`p_atk_<name>_<mode>`; `p_imp_*` / `p_skill_*` / `p_aoe_*` / the enemy bundles `e_*` are the same. The community
mirrors the web build downloads from (AA2 `audio/sound_beta_2/...`) carry only the files some other project listed,
so a skill-mode swing / impact file the client has can be absent there — `tools/fetch-assets.mjs` then drops the
manifest leaf and the browser plays nothing during that skill (the owner's 2026-10-27 report: 烛煌's S3 bullets).

The clips inside the bundles are WAV; the web build serves MP3. This script converts with ffmpeg (the bundled
imageio-ffmpeg binary is used when no `ffmpeg` is on PATH) and writes the same relative paths the manifest uses:
`public/assets/audio/sfx/<kind>/<prefix>/<clip>.mp3` — kind/prefix read off the clip name (`p_atk_*` → player/p_atk,
`e_imp_*` → enemy/e_imp, `b_char_*` → battle/b_char, …).

Usage:
  py -3.14 tools/local-extract/sfx.py --game "<client>/Arknights_Data/StreamingAssets/AB/Windows" \\
      --wanted "%TEMP%/sp-wanted-sfx.json" [--out public/assets/audio/sfx] [--force] [--dry-run] [--jobs 4]
  py -3.14 tools/local-extract/sfx.py --game <AB> --list      # every clip the bundles contain (name per line)

`--wanted` is a JSON array of the manifest's relative paths (`audio/sfx/player/p_atk/p_atk_x_s.mp3`) — the leaves
`node tools/fetch-assets.mjs --offline` reports as dropped, computed by the audio pickers (tools/assets/audio.mjs).
Without it every clip is written. Existing files are left alone unless `--force`.

Requires: UnityPy, lz4 (tools/local-extract/requirements.txt) and an ffmpeg binary.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aklz4  # noqa: E402,F401  registers the LZ4AK decompressor the CN bundles use
import UnityPy  # noqa: E402

# clip name prefix → the manifest's folder under public/assets/audio/sfx (audio/sfx/<kind>/<prefix>/)
PREFIX_DIR = {
    'p_atk': 'player/p_atk',
    'p_imp': 'player/p_imp',
    'p_skill': 'player/p_skill',
    'p_aoe': 'player/p_aoe',
    'e_atk': 'enemy/e_atk',
    'e_imp': 'enemy/e_imp',
    'e_skill': 'enemy/e_skill',
    'e_aoe': 'enemy/e_aoe',
    'e_char': 'enemy/e_char',
    'b_char': 'battle/b_char',
    'b_enemy': 'battle/b_enemy',
    'b_ui': 'battle/b_ui',
    'g_ui': 'general/g_ui',
    'a_bat': 'ambience/a_bat',
}


def dir_of(name: str) -> str:
    """`p_atk_hcnsrfr_s` → `player/p_atk` (the two-token prefix; a lone prefix keeps its own name)."""
    parts = name.split('_')
    prefix = '_'.join(parts[:2]) if len(parts) > 2 else '_'.join(parts[:1])
    if prefix in PREFIX_DIR:
        return PREFIX_DIR[prefix]
    if parts[0] in ('p', 'e', 'b', 'g', 'a'):
        return {'p': 'player', 'e': 'enemy', 'b': 'battle', 'g': 'general', 'a': 'ambience'}[parts[0]] + '/' + prefix
    return 'misc/' + prefix


def ffmpeg_exe() -> str:
    exe = shutil.which('ffmpeg')
    if exe:
        return exe
    try:
        import imageio_ffmpeg  # optional, ships a static build
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:  # noqa: BLE001
        raise SystemExit('no ffmpeg: install it, or `py -3.14 -m pip install --user imageio-ffmpeg`') from exc


def to_mp3(wav: bytes, out: Path, ffmpeg: str) -> int:
    """WAV bytes → MP3 at `out` (96 kbps mono is plenty for a battle cue); returns the written size."""
    with tempfile.TemporaryDirectory(prefix='sp-sfx-') as tmp:
        src = Path(tmp) / 'in.wav'
        dst = Path(tmp) / 'out.mp3'
        src.write_bytes(wav)
        cmd = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(src),
               '-codec:a', 'libmp3lame', '-b:a', '96k', '-ac', '1', str(dst)]
        res = subprocess.run(cmd, capture_output=True)
        if res.returncode or not dst.exists():
            raise RuntimeError(f'ffmpeg failed: {res.stderr.decode("utf-8", "replace")[:200]}')
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(dst), out)
        return out.stat().st_size


def bundles(game: Path):
    root = game / 'audio' / 'sound_beta_2'
    if not root.is_dir():
        raise SystemExit(f'{root} is not the client\'s audio folder (pass --game <client>/Arknights_Data/StreamingAssets/AB/Windows)')
    for kind in ('player', 'enemy'):
        for ab in sorted((root / kind).rglob('*.ab')):
            yield ab


def clips(ab: Path):
    """(name, wav bytes) of every AudioClip in one bundle."""
    env = UnityPy.load(str(ab))
    for obj in env.objects:
        if obj.type.name != 'AudioClip':
            continue
        try:
            d = obj.read()
        except Exception:  # noqa: BLE001  a malformed clip is skipped, not fatal
            continue
        name = str(getattr(d, 'm_Name', '') or '')
        samples = getattr(d, 'samples', None) or {}
        for key, data in samples.items():
            clip = name or Path(str(key)).stem
            if not data:
                continue
            yield clip, bytes(data)


def main() -> int:
    ap = argparse.ArgumentParser(description='extract the battle SFX of a local Arknights client')
    ap.add_argument('--game', required=True, help='<client>/Arknights_Data/StreamingAssets/AB/Windows')
    ap.add_argument('--assets', default='public/assets', help='the assets root the relative paths live under')
    ap.add_argument('--wanted', help='JSON array of audio/sfx/... relative paths (default: every clip)')
    ap.add_argument('--force', action='store_true', help='rewrite files that already exist')
    ap.add_argument('--dry-run', action='store_true', help='report only')
    ap.add_argument('--list', action='store_true', help='list every clip name and exit')
    args = ap.parse_args()

    game = Path(args.game)
    if not game.is_absolute():
        game = Path.cwd() / game
    assets = Path(args.assets)
    wanted = None
    if args.wanted:
        rels = json.loads(Path(args.wanted).read_text(encoding='utf-8'))
        wanted = {}
        for rel in rels:
            rel = rel.replace('\\', '/')
            if not rel.startswith('audio/sfx/'):
                rel = 'audio/sfx/' + rel
            wanted[Path(rel).stem] = rel
        print(f'wanted: {len(wanted)} clips', flush=True)
    ffmpeg = None if args.list or args.dry_run else ffmpeg_exe()
    written = skipped = missing = 0
    seen = set()
    for ab in bundles(game):
        for name, wav in clips(ab):
            seen.add(name)
            if args.list:
                print(name)
                continue
            if wanted is not None:
                rel = wanted.get(name)
                if rel is None:
                    continue
            else:
                rel = f'audio/sfx/{dir_of(name)}/{name}.mp3'
            dst = assets / rel  # the rel already carries audio/sfx/…
            if dst.exists() and not args.force:
                skipped += 1
                continue
            if args.dry_run:
                print(f'would write {rel} ({len(wav)} B wav)')
                continue
            try:
                size = to_mp3(wav, dst, ffmpeg)
            except RuntimeError as exc:
                print(f'!! {name}: {exc}', flush=True)
                continue
            written += 1
            print(f'{rel} ({size} B)', flush=True)
    if wanted is not None and not args.list:
        missing = [n for n in wanted if n not in seen]
        for n in missing[:20]:
            print(f'missing from the client: {wanted[n]}')
    if not args.list:
        print(f'done: {written} written, {skipped} already there, {len(missing) if wanted else 0} not in the client')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
