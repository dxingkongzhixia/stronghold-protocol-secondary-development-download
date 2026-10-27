#!/usr/bin/env python3
"""Extract the operators' full-body 立绘 from the locally installed Arknights client, cropped for the seat card.

`tools/illust.mjs` downloads those illustrations from Aceship; an operator newer than that dump has none, and then
`node tools/fetch-assets.mjs --offline` refuses to write a manifest that loses its `chars[<id>].illust` entry (the
owner's 2026-10-27 report). The local client has them: `chararts/<charId>.ab` carries the E0/E1 art as the sprite
`<charId>_1` and the E2 art as `<charId>_2`.

The crop is the same one `tools/assets/illust.mjs` applies to the downloaded PNGs (top ~65 % of the alpha box in a 3:5
window, centred, resized to `--max-height`, WebP q88): the card looks identical whichever source filled it.

Usage:
  py -3.14 tools/local-extract/illust.py --game "<client>/Arknights_Data/StreamingAssets/AB/Windows" \\
      --wanted "%TEMP%/sp-wanted-illust.json" [--out public/assets/char/illust] [--force] [--dry-run]
  py -3.14 tools/local-extract/illust.py --game <AB> --only=char_1040_blaze2

`--wanted` is a JSON array of charIds (the `chars.<id>.illust` leaves `fetch-assets --offline` reports as dropped).
Requires UnityPy, lz4 and Pillow (tools/local-extract/requirements.txt).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aklz4  # noqa: E402,F401  registers the LZ4AK decompressor the CN bundles use
import UnityPy  # noqa: E402
from PIL import Image  # noqa: E402

ILLUST_MAX_HEIGHT = 1100


def crop_card(im: Image.Image, max_h: int, top: float = 0.40) -> Image.Image:
    """A head-and-torso 3:5 card window from the client's FULL-BODY art.

    `tools/assets/illust.mjs` crops the Aceship PNGs, which are already the game's portrait framing (roughly the head
    and upper body); the client's `chararts` sprite is the whole standing operator with its effects. Taking the top
    `top` of its alpha box in a 3:5 window centred on it gives the same card look (烛煌 checked against Kal'tsit's).
    """
    im = im.convert('RGBA')
    w, h = im.size
    x0, y0, x1, y1 = im.getbbox() or (0, 0, w, h)
    bw, bh = max(1, x1 - x0), max(1, y1 - y0)
    ch = max(1, int(bh * top))
    cw = max(1, int(ch * 0.6))
    cx = (x0 + x1) // 2
    left = max(0, min(w - cw, cx - cw // 2))
    top_px = max(0, min(h - ch, y0))
    im = im.crop((left, top_px, left + cw, top_px + ch))
    w, h = im.size
    if h > max_h:
        w = max(1, round(w * max_h / h))
        im = im.resize((w, max_h), Image.LANCZOS)
    return im


def art_for(ab: Path, char_id: str) -> Image.Image | None:
    """The operator's E0/E1 art (`<id>_1`), else E2 (`<id>_2`), else the plain sprite."""
    env = UnityPy.load(str(ab))
    found = {}
    for obj in env.objects:
        if obj.type.name != 'Sprite':
            continue
        try:
            d = obj.read()
            name = str(getattr(d, 'm_Name', '') or '')
            img = getattr(d, 'image', None)
            if img is not None:
                found[name] = img
        except Exception:  # noqa: BLE001  a sprite UnityPy cannot decode is just a miss
            continue
    for key in (f'{char_id}_1', f'{char_id}_2', char_id, f'{char_id}_1b', f'{char_id}_2b'):
        if key in found:
            return found[key]
    # a bundle whose sprites are named differently (skins): the largest one is the art
    if found:
        return max(found.values(), key=lambda i: i.size[0] * i.size[1])
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description='extract the operators\' 立绘 from a local Arknights client')
    ap.add_argument('--game', required=True, help='<client>/Arknights_Data/StreamingAssets/AB/Windows')
    ap.add_argument('--out', default='public/assets/char/illust')
    ap.add_argument('--wanted', help='JSON array of charIds (default: every chararts bundle)')
    ap.add_argument('--only', help='comma-separated charIds')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--max-height', type=int, default=ILLUST_MAX_HEIGHT)
    args = ap.parse_args()

    game = Path(args.game)
    if not game.is_absolute():
        game = Path.cwd() / game
    out = Path(args.out)
    ids = None
    if args.wanted:
        ids = json.loads(Path(args.wanted).read_text(encoding='utf-8'))
    elif args.only:
        ids = [s.strip() for s in args.only.split(',') if s.strip()]
    if ids is None:
        ids = [p.stem for p in sorted((game / 'chararts').glob('*.ab'))]
    written = skipped = missed = 0
    for cid in ids:
        ab = game / 'chararts' / f'{cid}.ab'
        if not ab.is_file():
            print(f'missing bundle: {cid}', flush=True)
            missed += 1
            continue
        dst = out / f'{cid}.webp'
        if dst.exists() and not args.force:
            skipped += 1
            continue
        if args.dry_run:
            print(f'would write {dst}')
            continue
        img = art_for(ab, cid)
        if img is None:
            print(f'no art in {cid}', flush=True)
            missed += 1
            continue
        card = crop_card(img, args.max_height)
        out.mkdir(parents=True, exist_ok=True)
        tmp = dst.with_suffix('.webp.tmp')
        card.save(tmp, 'WEBP', quality=88, method=6)
        tmp.replace(dst)
        written += 1
        print(f'{dst} ({card.size[0]}x{card.size[1]})', flush=True)
    print(f'done: {written} written, {skipped} already there, {missed} missing')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
