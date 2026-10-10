#!/usr/bin/env python3
"""Fill the manifest's operator voice files from a locally installed Arknights client.

The official client stores each operator's voice as one AssetBundle
`audio/sound_beta_2/<lang-dir>/<operatorId>.ab` holding every line as an AudioClip named
`CN_019`, `CN_020`, … (the CN *line id*, whatever the language). The web manifest
(`data/assets.json` audio.voice.<op>.<key> → /assets/audio/voice/<lang>/<op>/<id>.mp3) is what
the client plays, so this script decodes the clips the manifest wants and writes them where it
points — no manifest change is needed.

`<lang-dir>` is the client's voice folder: `voice` is the client's own default language (a JP
install's Japanese lines), `voice_cn` / `voice_en` are the CN / EN dubs when downloaded. The
manifest keeps its own `<lang>` segment, so filling it from `voice_cn` reproduces upstream's CN
manifest exactly, while `voice` (the default) drops the client's language into those slots.

Usage:
  .venv-extract/Scripts/python.exe tools/local-extract/extract-voice.py \
      --voice-dir "D:/.../audio/sound_beta_2/voice" [--only char_102_texas ...] [--lang cn]

  --print-jobs    list what would be written, without extracting (no UnityPy needed)
  --ffmpeg PATH   the ffmpeg used to encode mp3 (default: ffmpeg on PATH)
  --bitrate 96k   mp3 bitrate

Needs UnityPy + lz4 (tools/local-extract/requirements.txt; `aklz4.py` decodes the LZ4AK
bundles) and Pillow only for the other extractor. Everything is (c) Hypergryph; private,
non-commercial fan use only.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_VOICE_DIR = Path(
    'D:/本地网络游戏中心/鹰角启动器/YostarGames/Arknights_JP/Arknights_Data/'
    'PersistentData/Bundles/audio/sound_beta_2/voice'
)


def targets(manifest, lang=None, dub='cn'):
    """op -> { CLIP_NAME: out rel path } for every voice file the manifest lists.

    `dub` picks the manifest tree: 'cn' (default) reads `audio.voice` (the 中文 setting), 'jp' reads `audio.voiceJp`
    (the 日本語 setting) — the same file names, under `/audio/voice/jp/`. The client's bundle folder differs (a JP
    install's `voice` is the JP dub, `voice_cn` the CN one) while the AudioClip names are the CN line ids either way.
    """
    audio = manifest.get('audio') or {}
    voice = (audio.get('voiceJp') if dub == 'jp' else audio.get('voice')) or {}
    out = {}
    for op, kv in voice.items():
        if not isinstance(kv, dict):
            continue
        for v in kv.values():
            for p in (v if isinstance(v, list) else [v]):
                if not isinstance(p, str) or not p.endswith('.mp3') or '/audio/voice/' not in p:
                    continue
                if lang and f'/audio/voice/{lang}/' not in p:
                    continue
                fn = p.rsplit('/', 1)[1]
                out.setdefault(op, {})[fn[:-4].upper()] = p
    return out


def rel_to_disk(rel):
    """'/assets/audio/voice/cn/x/cn_019.mp3' -> <ROOT>/public/assets/audio/voice/cn/x/cn_019.mp3"""
    return ROOT / 'public' / rel.lstrip('/').replace('/', os.sep)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--voice-dir', default=str(DEFAULT_VOICE_DIR), help='the client voice bundle dir')
    ap.add_argument('--dub', choices=['cn', 'jp'], default='cn', help="manifest tree to fill: cn (audio.voice, default) | jp (audio.voiceJp)")
    ap.add_argument('--lang', default=None, help='only fill this manifest language segment (e.g. cn)')
    ap.add_argument('--only', nargs='*', default=None, help='only these operator ids')
    ap.add_argument('--ffmpeg', default=shutil.which('ffmpeg') or 'ffmpeg')
    ap.add_argument('--bitrate', default='96k')
    ap.add_argument('--print-jobs', action='store_true', help='list what would be written and exit')
    args = ap.parse_args()

    manifest = json.load(open(ROOT / 'data' / 'assets.json', encoding='utf-8'))
    todo = targets(manifest, args.lang, args.dub)
    if args.only:
        todo = {k: v for k, v in todo.items() if k in set(args.only)}

    if args.print_jobs:
        for op, clips in todo.items():
            print(f'{op}: {len(clips)} clips -> ' + str(sorted(clips)[:3]) + ' …')
        print(f'{len(todo)} operators, {sum(len(v) for v in todo.values())} clips')
        return 0

    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    import UnityPy

    vdir = Path(args.voice_dir)
    t0 = time.time()
    done = miss = fail = 0
    for i, (op, clips) in enumerate(todo.items()):
        bundle = vdir / f'{op}.ab'
        if not bundle.exists():
            miss += len(clips)
            print(f'  MISSING BUNDLE {op} ({len(clips)} clips)')
            continue
        try:
            env = UnityPy.load(str(bundle))
            got = {}
            for obj in env.objects:
                if obj.type.name == 'AudioClip':
                    d = obj.read()
                    got[d.m_Name] = d
            for clip, rel in clips.items():
                d = got.get(clip)
                if d is None:
                    fail += 1
                    continue
                try:
                    wav = next(iter(d.samples.values()))
                except Exception:  # noqa: BLE001
                    fail += 1
                    continue
                outp = rel_to_disk(rel)
                outp.parent.mkdir(parents=True, exist_ok=True)
                tmp = str(outp) + '.tmp.wav'
                with open(tmp, 'wb') as f:
                    f.write(wav)
                r = subprocess.run(
                    [args.ffmpeg, '-y', '-loglevel', 'error', '-i', tmp,
                     '-codec:a', 'libmp3lame', '-b:a', args.bitrate, str(outp)]
                )
                try:
                    os.remove(tmp)
                except OSError:
                    pass
                done += 1 if r.returncode == 0 else 0
                fail += 0 if r.returncode == 0 else 1
            del env
        except Exception as e:  # noqa: BLE001
            fail += len(clips)
            print(f'  ERR {op}: {e}')
        if (i + 1) % 10 == 0:
            print(f'  {i + 1}/{len(todo)} ops, ok={done} miss={miss} fail={fail}, {time.time() - t0:.0f}s', flush=True)

    print(f'DONE ok={done} miss={miss} fail={fail} in {time.time() - t0:.0f}s')
    return 0 if fail == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
