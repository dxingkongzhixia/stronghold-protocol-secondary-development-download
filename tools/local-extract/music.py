#!/usr/bin/env python3
"""Extract the official 音乐鉴赏 catalogue from a local Arknights client into the Hub's optional music pack.

The PC client ships one Unity AssetBundle per track under
`Arknights_Data/StreamingAssets/AB/Windows/audio/sound_beta_2/music/<act>/<stem>.ab`; each carries the
game's own AudioClip(s) (`<stem>_intro`, `<stem>_loop`) as 44.1 kHz stereo PCM. The bundles use the
client's LZ4AK compression, so `tools/local-extract/aklz4.py` is imported first (it registers the
decoder with UnityPy). The output is a self-contained pack outside the repository:

  var/music/<musicId>_intro.mp3
  var/music/<musicId>_loop.mp3
  var/music/index.json                 { version, generated, entries: { id: { name, group, intro?, loop } } }

`server/index.js` serves it at `/music/…` (the client's `ui/musicLibrary.js` reads `/music/index.json`).
Nothing here is committed; a clone without the pack keeps the 24 committed fallback tracks in
data/assets.json (`audio.lobbyMusic`) and simply hides the rest.

Loudness: every file goes through ffmpeg's `loudnorm` to -14 LUFS / -1 dBTP (the cause of the
"音乐太小声" report: the original masters sit around -17 LUFS and the page's BGM bus attenuated them
once more). 160 kbps LAME is transparent enough for background music and keeps the pack around 580 MB
for all 218 tracks (8.4 h).

Requirements (same optional local-extract stack as extract.py, docs/ASSETS.md "Local client"):
  py -3.14 -m pip install --user UnityPy lz4 imageio-ffmpeg
  (imageio-ffmpeg supplies an ffmpeg binary; a system ffmpeg is used when it is on PATH)

Usage:
  py -3.14 tools/local-extract/music.py --game "D:/…/Arknights_Data/StreamingAssets/AB/Windows"
  py -3.14 tools/local-extract/music.py --only music_bg_default,music_bg_yan --force
  py -3.14 tools/local-extract/music.py --list          # print the catalogue and the bundle paths
  py -3.14 tools/local-extract/music.py --dry-run       # extraction plan, no writes

The catalogue is `excel/audio_data.json` `musics[]` (the game's own list; 241 entries, 218 unique
recordings — duplicates by recording path keep the highest-priority id: the 24 Hub themes first, then
`music_bg_*`, then the activity / rogue / sandbox ids, and `music_3in1bg_*` last).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

try:  # the Windows console defaults to GBK; track names are UTF-8 (Sanrio, Latin diacritics)
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import aklz4  # noqa: E402,F401  (registers LZ4AK/LZHAM with UnityPy)
import UnityPy  # noqa: E402

DATA = ROOT / '.cache' / 'gamedata' / 'excel' / 'audio_data.json'
ASSETS = ROOT / 'data' / 'assets.json'
OUT_DEFAULT = ROOT / 'var' / 'music'
CLIENT_MUSIC = 'audio/sound_beta_2/music'
CLIENT_AUDIO = 'audio/sound_beta_2'
GROUPS = ('theme', 'event', 'collab', 'contract', 'rogue', 'sandbox', 'story', 'other')
# The picker's own catalogue (tools/assets/lobby-music.mjs) always keeps its ids and names.
CURATED = (
    'music_bg_default', 'music_bg_tech', 'music_bg_ddd', 'music_bg_street', 'music_bg_loneliness',
    'music_bg_yan', 'music_bg_iberia', 'music_bg_laterano', 'music_bg_rhine', 'music_bg_office',
    'music_bg_act16mini', 'music_bg_dungeon', 'music_bg_sui', 'music_bg_adastra',
    'music_bg_anniversary', 'music_bg_redvelvet_1', 'music_bg_rainbowsix', 'music_bg_volcano_day',
    'music_bg_volcano_night', 'music_bg_avemujica', 'music_bg_little_pony', 'music_bg_p3r_1',
    'music_bg_recalrune', 'music_bg_recalrune2',
)
COLLAB = re.compile(r'rainbowsix|p3r|avemujica|little_pony|sanrio|volcano|ghosthunter|elitelounge|'
                    r'furniture_(frostnova|musicbox|audioplayer)|act32side|act54side|act74d8d0', re.I)
CONTRACT = re.compile(r'recalrune|ccs|rune|crisis', re.I)


def norm_rel(p: str) -> str:
    """`Audio/Sound_Beta_2/Music/act/x_loop` -> `music/act/x` (the bundle stem)."""
    p = p.replace('\\', '/').replace('Audio/Sound_Beta_2/', '', 1)
    p = re.sub(r'_(intro|loop)$', '', p, flags=re.I)
    return p.lower()


def clean_name(name: str) -> str:
    s = re.sub(r'<br\s*/?>', ' ', str(name or ''), flags=re.I)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def group_of(mid: str, bank: str, loop_rel: str) -> str:
    hay = f'{mid} {bank} {loop_rel}'
    # A 主界面 theme stays a 主界面 theme even when its recording is shared with a rogue / event bundle
    # (music_bg_redvelvet_1 → rogue_1/m_sys_rglk1phantomcastle_loop).
    if mid.startswith('music_bg_'):
        if CONTRACT.search(mid):
            return 'contract'
        if COLLAB.search(mid):
            return 'collab'
        return 'theme'
    if CONTRACT.search(hay):
        return 'contract'
    if re.search(r'rogue|rglk', hay, re.I):
        return 'rogue'
    if re.search(r'sandbox', hay, re.I):
        return 'sandbox'
    if COLLAB.search(hay):
        return 'collab'
    if re.search(r'3in1bg_main|building_default|furniture_|ON_SCENE_LOADED|ON_PAGE_EXISTED|ON_MUSIC\.furniture', hay, re.I):
        return 'story'
    if mid.startswith('music_act') or 'ON_ACTIVITY_LOADED' in bank or 'ON_RETRO_LOADED' in bank:
        return 'event'
    return 'other'


def load_catalogue(path: Path):
    data = json.loads(path.read_text(encoding='utf-8'))
    banks = {b['name']: b for b in data.get('bgmBanks', []) if isinstance(b, dict) and b.get('name')}
    alias = data.get('bankAlias') or {}

    def bgm(name: str, depth: int = 0):
        if name in banks:
            return banks[name]
        if depth < 4 and isinstance(alias.get(name), str):
            return bgm(alias[name], depth + 1)
        return None

    by_rel: dict[str, list[dict]] = {}
    for m in data.get('musics', []) or []:
        if not isinstance(m, dict) or not m.get('id'):
            continue
        b = bgm(m.get('bank'))
        if not b or not b.get('loop'):
            continue
        loop_rel = norm_rel(b['loop'])
        intro_rel = norm_rel(b['intro']) if b.get('intro') else None
        by_rel.setdefault(loop_rel, []).append({
            'id': str(m['id']),
            'name': clean_name(m.get('name')),
            'bank': str(m.get('bank') or ''),
            'intro_rel': intro_rel,
            'loop_rel': loop_rel,
        })
    # One entry per recording. Keep the id a player recognises: the picker's ids first, then music_bg_*,
    # then ordinary act ids, then the internal 3in1bg ids.
    def priority(e):
        mid = e['id']
        if mid in CURATED:
            return (0, CURATED.index(mid))
        if mid.startswith('music_bg_'):
            return (1, mid)
        if mid.startswith('music_3in1bg_'):
            return (3, mid)
        return (2, mid)
    chosen = []
    for rel, items in by_rel.items():
        e = min(items, key=priority)
        e['group'] = group_of(e['id'], e['bank'], rel)
        chosen.append(e)
    chosen.sort(key=lambda e: (GROUPS.index(e['group']), priority(e)))
    return chosen


def find_ffmpeg() -> str:
    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and Path(exe).exists():
            return exe
    except Exception:
        pass
    exe = shutil.which('ffmpeg')
    if exe:
        return exe
    raise SystemExit('ffmpeg not found: pip install --user imageio-ffmpeg, or put ffmpeg on PATH')


def find_bundle(game: Path, rel: str) -> Path | None:
    # rel is `music/<act>/<stem>` (norm_rel keeps the `music/` segment).
    p = game / CLIENT_AUDIO / f'{rel}.ab'
    if p.exists():
        return p
    # Windows is case-insensitive; a dump copied from another platform may not be.
    cur = game / CLIENT_AUDIO
    for seg in rel.split('/'):
        if not cur.is_dir():
            return None
        hit = next((x for x in cur.iterdir() if x.name.lower() == seg.lower()), None)
        if not hit:
            return None
        cur = hit
    p = cur.with_suffix('.ab')
    return p if p.exists() else None


def clips_of(bundle: Path):
    env = UnityPy.load(str(bundle))
    out = []
    for obj in env.objects:
        if obj.type.name != 'AudioClip':
            continue
        clip = obj.read()
        for name, wav in clip.samples.items():
            out.append((name, wav))
    return out


def pick_clips(items):
    # UnityPy names the exported samples `<clip>.wav` (m_sys_void_intro.wav).
    intro = next(((n, w) for n, w in items if re.search(r'_intro\.wav$', n, re.I)), None)
    loop = next(((n, w) for n, w in items if re.search(r'_loop\.wav$', n, re.I)), None)
    if loop is None:
        # A single recording (m_avg_SiestaCity, m_sys_act9mini) or a `_combine` clip: use the longest.
        rest = [x for x in items if not re.search(r'_intro\.wav$', x[0], re.I)]
        loop = max(rest or items, key=lambda x: len(x[1])) if items else None
        if intro and loop and intro[0] == loop[0]:
            intro = None  # an intro-only bundle is one recording, not an intro plus a loop
    return intro, loop


def encode(ffmpeg: str, wav: bytes, dst: Path, bitrate: str, loudnorm: str) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        tmp.write(wav)
        tmp_path = tmp.name
    try:
        cmd = [ffmpeg, '-y', '-hide_banner', '-loglevel', 'error', '-i', tmp_path]
        if loudnorm:
            cmd += ['-af', loudnorm]
        cmd += ['-c:a', 'libmp3lame', '-b:a', bitrate, '-ar', '44100', '-ac', '2', '-map_metadata', '-1', str(dst)]
        subprocess.run(cmd, check=True, capture_output=True)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def write_index(out: Path, entries: dict, generated: str) -> None:
    doc = {'version': 1, 'generated': generated, 'entries': entries}
    tmp = out / '.index.json.tmp'
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding='utf-8')
    os.replace(tmp, out / 'index.json')


def main() -> int:
    ap = argparse.ArgumentParser(description='Extract the official music catalogue into the optional var/music pack.')
    ap.add_argument('--game', required=False, help='…/Arknights_Data/StreamingAssets/AB/Windows')
    ap.add_argument('--out', default=str(OUT_DEFAULT), help=f'output pack (default {OUT_DEFAULT})')
    ap.add_argument('--only', default='', help='comma-separated music ids')
    ap.add_argument('--force', action='store_true', help='re-encode files that already exist')
    ap.add_argument('--bitrate', default='160k', help='MP3 bitrate (default 160k)')
    ap.add_argument('--loudnorm', default='loudnorm=I=-14:TP=-1.0:LRA=11',
                    help='ffmpeg filter (default -14 LUFS; empty disables)')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--list', action='store_true', help='print the catalogue and exit')
    args = ap.parse_args()

    catalogue = load_catalogue(DATA)
    if args.only:
        want = {x.strip() for x in args.only.split(',') if x.strip()}
        catalogue = [e for e in catalogue if e['id'] in want]
    if args.list:
        for e in catalogue:
            print(f"{e['id']}\t{e['group']}\t{e['name']}\t{e['loop_rel']}")
        print(f'{len(catalogue)} tracks')
        return 0
    if not args.game:
        raise SystemExit('--game is required (…/Arknights_Data/StreamingAssets/AB/Windows)')
    game = Path(args.game)
    if not (game / CLIENT_MUSIC).is_dir():
        raise SystemExit(f'no {CLIENT_MUSIC} under {game}')
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    ffmpeg = find_ffmpeg()
    generated = time.strftime('%Y-%m-%dT%H:%M:%S%z')
    entries: dict[str, dict] = {}
    index_path = out / 'index.json'
    if index_path.exists() and not args.force:
        try:
            old = json.loads(index_path.read_text(encoding='utf-8')).get('entries') or {}
            entries.update({k: v for k, v in old.items() if isinstance(v, dict) and v.get('loop')})
        except Exception:
            pass
    missing = []
    done = 0
    for i, e in enumerate(catalogue, 1):
        mid = e['id']
        loop_dst = out / f'{mid}_loop.mp3'
        intro_dst = out / f'{mid}_intro.mp3'
        files = [('loop', loop_dst)]
        if e.get('intro_rel'):
            files.append(('intro', intro_dst))
        if not args.force and all(p.exists() and p.stat().st_size > 10_000 for _, p in files):
            entries[mid] = {'name': e['name'], 'group': e['group'],
                            **({'intro': f'/music/{intro_dst.name}'} if e.get('intro_rel') else {}),
                            'loop': f'/music/{loop_dst.name}'}
            continue
        bundle = find_bundle(game, e['loop_rel'])
        if not bundle:
            missing.append(f"{mid} ({e['loop_rel']})")
            print(f'[{i}/{len(catalogue)}] MISSING bundle {e["loop_rel"]}', flush=True)
            continue
        if args.dry_run:
            print(f'[{i}/{len(catalogue)}] would extract {bundle} -> {mid}', flush=True)
            continue
        try:
            intro_clip, loop_clip = pick_clips(clips_of(bundle))
            if not loop_clip:
                missing.append(f'{mid} (no AudioClip)')
                continue
            encode(ffmpeg, loop_clip[1], loop_dst, args.bitrate, args.loudnorm)
            entry = {'name': e['name'], 'group': e['group'], 'loop': f'/music/{loop_dst.name}'}
            if intro_clip:
                encode(ffmpeg, intro_clip[1], intro_dst, args.bitrate, args.loudnorm)
                entry['intro'] = f'/music/{intro_dst.name}'
            entries[mid] = entry
            done += 1
            print(f'[{i}/{len(catalogue)}] + {mid} ({e["group"]}) {e["name"]}', flush=True)
        except Exception as err:
            missing.append(f'{mid} ({type(err).__name__}: {err})')
            print(f'[{i}/{len(catalogue)}] FAILED {mid}: {err}', flush=True)
        if done and done % 10 == 0:
            write_index(out, entries, generated)
    if not args.dry_run:
        write_index(out, entries, generated)
    total = sum(p.stat().st_size for p in out.glob('*.mp3'))
    print(f'pack: {len(entries)} tracks, {total / 1048576:.1f} MB -> {out}')
    if missing:
        print(f'missing/failed ({len(missing)}): {", ".join(missing[:20])}')
    return 0 if not missing or len(missing) < len(catalogue) else 1


if __name__ == '__main__':
    raise SystemExit(main())
