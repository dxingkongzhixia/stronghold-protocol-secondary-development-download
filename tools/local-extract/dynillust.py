#!/usr/bin/env python3
"""Extract a *dynamic illustration* (动态皮肤 / L2D) from the official client into a web-ready Spine set.

The official client ships each dynamic outfit as an AssetBundle under
`arts/dynchars/<skinId>.ab` (hot updates) — a prefab that carries a Spine skeleton (`dyn_illust_<skinId>.skel`),
its atlas and its page textures. This script keeps only the main illustration skeleton (the idle loop), rewrites the
atlas page names to plain web files, and writes an `entry.json` the hub backdrop reads.

  python tools/local-extract/dynillust.py `
    --bundle "<Arknights>/Arknights_Data/PersistentData/Bundles/arts/dynchars/char_1038_whitw2_sale#15.ab" `
    --id char_1038_whitw2@sale#15 --name 无序的谦卑 --group 忒斯特收藏/XVII --char char_1038_whitw2

The output is machine-local art (`public/assets` is git-ignored): the repository never carries official skin art.
`<out>/index.json` is the list the client reads; re-running replaces one entry.
"""
import argparse
import hashlib
import io
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import aklz4  # noqa: E402,F401  (patches UnityPy's LZHAM slot with Arknights' LZ4AK decoder)
import UnityPy  # noqa: E402
from PIL import Image  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SAFE = re.compile(r'[^A-Za-z0-9_.-]+')


def slug(text):
    return SAFE.sub('_', str(text)).strip('_') or 'dyn'


def read_bundle(path):
    """TextAssets (name -> bytes) and Texture2Ds (name -> PIL.Image) of one bundle."""
    env = UnityPy.load(str(path))
    texts, textures = {}, {}
    for obj in env.objects:
        try:
            data = obj.read()
        except Exception:
            continue
        name = getattr(data, 'm_Name', None)
        if obj.type.name == 'TextAsset':
            raw = data.m_Script
            texts[name] = raw.encode('utf-8', 'surrogateescape') if isinstance(raw, str) else bytes(raw)
        elif obj.type.name == 'Texture2D':
            try:
                textures[name] = data.image.convert('RGBA')
            except Exception as exc:  # a texture that cannot be decoded is skipped, the atlas check reports it
                print(f'  ! texture {name}: {exc}')
    return texts, textures


def atlas_pages(atlas_text):
    """Page file names of an atlas (the un-indented lines ending in .png)."""
    return [ln.strip() for ln in atlas_text.splitlines() if ln and not ln[0].isspace() and ln.strip().endswith('.png')]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--bundle', required=True, help='arts/dynchars/<skinId>.ab (hot update) or chararts/...')
    ap.add_argument('--id', required=True, help='skin id, e.g. char_1038_whitw2@sale#15')
    ap.add_argument('--char', default='', help='operator charId (info only)')
    ap.add_argument('--name', default='', help='display name (info only)')
    ap.add_argument('--group', default='', help='skin group (info only)')
    ap.add_argument('--out', default=str(ROOT / 'public' / 'assets' / 'dynillust'), help='output root')
    ap.add_argument('--quality', type=int, default=92, help='WebP quality (alpha is kept)')
    ap.add_argument('--keep-start', action='store_true', help='also keep the _Start (entrance) skeleton')
    args = ap.parse_args()

    bundle = Path(args.bundle)
    if not bundle.is_file():
        sys.exit(f'no such bundle: {bundle}')
    print(f'reading {bundle} ({bundle.stat().st_size} bytes)')
    texts, textures = read_bundle(bundle)

    # The main illustration skeleton is `dyn_illust_<skin>`, the entrance one `dyn_illust_<skin>_Start`.
    wanted = []
    for name in texts:
        if not name.endswith('.skel'):
            continue
        stem = name[:-5]
        if not stem.startswith('dyn_illust_'):
            continue
        if stem.endswith('_Start') and not args.keep_start:
            continue
        wanted.append(stem)
    if not wanted:
        sys.exit('no dyn_illust_*.skel in the bundle')

    out_dir = Path(args.out) / slug(args.id)
    out_dir.mkdir(parents=True, exist_ok=True)
    entries = []
    for stem in sorted(wanted):
        atlas_name = f'{stem}.atlas'
        if atlas_name not in texts:
            sys.exit(f'missing {atlas_name}')
        atlas_text = texts[atlas_name].decode('utf-8', 'surrogateescape')
        pages = atlas_pages(atlas_text)
        if not pages:
            sys.exit(f'{atlas_name}: no page textures')
        missing = [p for p in pages if p[:-4] not in textures]
        if missing:
            sys.exit(f'{atlas_name}: missing textures {missing}')

        # one directory per skeleton; pages become page0.webp… and the atlas text points at them
        part = 'main' if len(wanted) == 1 else ('start' if stem.endswith('_Start') else 'main')
        part_dir = out_dir / part
        part_dir.mkdir(parents=True, exist_ok=True)
        page_files = []
        for i, page in enumerate(pages):
            image = textures[page[:-4]]
            out_page = f'page{i}.webp' if len(pages) > 1 else 'page.webp'
            image.save(part_dir / out_page, 'WEBP', quality=args.quality, method=6, alpha_quality=100)
            page_files.append(out_page)
            # rewrite exactly this page line (column 0, not a region name)
            atlas_text = re.sub(rf'(?m)^{re.escape(page)}\s*$', out_page, atlas_text)

        (part_dir / 'illust.skel').write_bytes(texts[f'{stem}.skel'])
        (part_dir / 'illust.atlas').write_text(atlas_text, encoding='utf-8')

        digest = hashlib.sha1()
        for f in [part_dir / 'illust.skel', part_dir / 'illust.atlas', *[part_dir / p for p in page_files]]:
            digest.update(f.read_bytes())
        entries.append({
            'part': part,
            'skel': f'{slug(args.id)}/{part}/illust.skel',
            'atlas': f'{slug(args.id)}/{part}/illust.atlas',
            'textures': [f'{slug(args.id)}/{part}/{p}' for p in page_files],
            'v': digest.hexdigest()[:12],
        })
        print(f'  {part}: {len(page_files)} page(s), atlas {len(texts[atlas_name])} bytes')

    entry = {
        'id': args.id,
        'charId': args.char,
        'name': args.name or args.id,
        'group': args.group,
        'parts': entries,
    }
    (out_dir / 'entry.json').write_text(json.dumps(entry, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    # The list the client fetches: one record per installed dynamic illustration.
    index_path = Path(args.out) / 'index.json'
    index = {'version': 1, 'entries': []}
    if index_path.is_file():
        try:
            index = json.loads(index_path.read_text(encoding='utf-8'))
        except Exception:
            index = {'version': 1, 'entries': []}
    entries_list = [e for e in index.get('entries', []) if e.get('id') != args.id]
    entries_list.append(entry)
    entries_list.sort(key=lambda e: (e.get('group') or '', e.get('name') or e.get('id')))
    index = {'version': 1, 'entries': entries_list}
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'wrote {out_dir} and {index_path} ({len(entries_list)} entries)')


if __name__ == '__main__':
    main()
