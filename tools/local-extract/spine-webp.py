"""Turn a cosmetic plugin's Spine page textures into WebP, keeping the atlas in step.

A room's visual set is capped at 300 MB (shared/plugins/visual.js VISUAL_LIMITS.setBytes)
and Spine pages are most of an official-outfit plugin. Browsers load WebP pages as well
as PNG, so converting them (and rewriting the atlas's page lines and the overlay's
`textures`) keeps a full skin pack inside one set.

  python tools/local-extract/spine-webp.py plugins/local-skins [--quality 90 | --lossless]

Then re-run `node tools/plugin.mjs pack <plugin>` — the lock records the file hashes.
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from extract import atlas_pages  # noqa: E402


def convert(atlas_file, quality, lossless, log):
    from PIL import Image

    text = atlas_file.read_text(encoding='utf-8', errors='replace')
    pages = atlas_pages(text)
    if not pages:
        return 0, 0
    folder = atlas_file.parent
    before = after = 0
    for page in pages:
        src = folder / page
        if not src.is_file() or src.suffix.lower() != '.png':
            continue
        dst = src.with_suffix('.webp')
        before += src.stat().st_size
        img = Image.open(src).convert('RGBA')
        if lossless:
            img.save(dst, 'WEBP', lossless=True, method=6)
        else:
            img.save(dst, 'WEBP', quality=quality, method=6)
        after += dst.stat().st_size
        text = text.replace(page, dst.name)
        src.unlink()
        log(f'  {atlas_file.parent.name}/{page} -> {dst.name}')
    if after:
        atlas_file.write_text(text, encoding='utf-8')
    return before, after


def main(argv=None):
    ap = argparse.ArgumentParser(description='Convert a plugin\'s Spine pages to WebP (atlas + overlay updated).')
    ap.add_argument('plugin', help='plugin folder')
    ap.add_argument('--quality', type=int, default=90, help='lossy WebP quality (default 90)')
    ap.add_argument('--lossless', action='store_true', help='lossless WebP (larger, exact pixels)')
    args = ap.parse_args(argv)

    root = Path(args.plugin)
    overlay_file = root / 'overlay.json'
    if not overlay_file.is_file():
        sys.exit(f'no overlay.json in {root}')
    overlay = json.loads(overlay_file.read_text(encoding='utf-8'))

    before = after = models = 0
    for atlas in sorted(root.glob('spine/**/*.atlas')):
        b, a = convert(atlas, args.quality, args.lossless, print)
        if a:
            before += b
            after += a
            models += 1

    # the overlay names the pages; point every textures entry at the new files
    for chars in (overlay.get('chars') or {}).values():
        for skin in (chars.get('skins') or {}).values():
            for face in (skin.get('spine') or {}).values():
                tex = face.get('textures')
                if isinstance(tex, list):
                    face['textures'] = [t[:-4] + '.webp' if t.lower().endswith('.png') else t for t in tex]
    overlay_file.write_text(json.dumps(overlay, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    if before:
        print(f'{models} models: {before / 1048576:.1f} MB -> {after / 1048576:.1f} MB '
              f'({100 - after * 100 / before:.0f}% smaller)')
    print('next: node tools/plugin.mjs pack', root.as_posix())
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
