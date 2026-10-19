"""Split an extracted outfit plugin into parts that fit the limits, and shrink illustrations.

A single plugin may hold at most 200 MB (`docs/PLUGINS.md` §5) and a room's composed visual
set at most 300 MB (`shared/plugins/visual.js` VISUAL_LIMITS.setBytes). The official outfits
of the whole roster are larger than both, so they are packed as a few plugins (one per part)
that a `plugins/config.json` `default` list can switch on together.

  python tools/local-extract/skins-split.py plugins/local-skins --parts 2
         [--illust-max 896] [--illust-quality 78]

Part 1 keeps the given folder; parts 2..N become `<folder>-2`, `<folder>-3` … Each part gets
its own overlay.json and plugin.json, and no plugin.lock.json (run `tools/plugin.mjs pack`).
"""
import argparse
import json
import shutil
import sys
from pathlib import Path


def files_of(record):
    out = []
    for kind in ('avatar', 'avatarE2', 'portrait', 'portraitE2', 'illust'):
        if isinstance(record.get(kind), str):
            out.append(record[kind])
    spine = record.get('spine') or {}
    for face in ('front', 'back'):
        v = face in spine and spine[face] or None
        if not isinstance(v, dict):
            continue
        for key in ('skel', 'atlas'):
            if isinstance(v.get(key), str):
                out.append(v[key])
        out.extend(t for t in v.get('textures') or [] if isinstance(t, str))
    return out


def shrink_illusts(root, overlay, max_side, quality, log):
    from PIL import Image

    before = after = count = 0
    seen = set()
    for chars in (overlay.get('chars') or {}).values():
        for record in (chars.get('skins') or {}).values():
            rel = record.get('illust')
            if not isinstance(rel, str) or rel in seen:
                continue
            seen.add(rel)
            path = root / rel
            if not path.is_file():
                continue
            before += path.stat().st_size
            img = Image.open(path).convert('RGBA')
            if max_side and max(img.size) > max_side:
                scale = max_side / max(img.size)
                img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), 1)
            img.save(path, 'WEBP', quality=quality, method=6)
            after += path.stat().st_size
            count += 1
    if count:
        log(f'illustrations: {count} files, {before / 1048576:.1f} MB -> {after / 1048576:.1f} MB')
    return before - after


def partition(chars, overlay, root, parts):
    sizes = {}
    for cid, chars_rec in chars.items():
        total = 0
        for record in (chars_rec.get('skins') or {}).values():
            for rel in set(files_of(record)):
                path = root / rel
                if path.is_file():
                    total += path.stat().st_size
        sizes[cid] = total
    bins = [dict(size=0, chars=[]) for _ in range(parts)]
    for cid in sorted(sizes, key=sizes.get, reverse=True):
        target = min(bins, key=lambda b: b['size'])
        target['chars'].append(cid)
        target['size'] += sizes[cid]
    for i, b in enumerate(bins, 1):
        b['chars'].sort()
        print(f'  part {i}: {len(b["chars"])} operators, {b["size"] / 1048576:.1f} MB')
    return [b['chars'] for b in bins]


def move_part(src, dst, char_ids, log):
    dst.mkdir(parents=True, exist_ok=True)
    for cid in char_ids:
        for sub in ('media', 'spine'):
            folder = src / sub / cid
            if not folder.is_dir():
                continue
            target = dst / sub / cid
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                shutil.rmtree(target)
            shutil.move(str(folder), str(target))
        log(f'  moved {cid}')


def write_part(folder, plugin, overlay, char_ids, index, total):
    name = dict(plugin.get('name') or {})
    suffix = f'（{index}/{total}）'
    for lang in list(name):
        name[lang] = f'{name[lang]}{suffix}'
    part = {**plugin, 'name': name}
    overlay = {'chars': {cid: overlay['chars'][cid] for cid in char_ids if cid in overlay['chars']}}
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'overlay.json').write_text(json.dumps(overlay, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    (folder / 'plugin.json').write_text(json.dumps(part, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    lock = folder / 'plugin.lock.json'
    if lock.exists():
        lock.unlink()


def main(argv=None):
    ap = argparse.ArgumentParser(description='Split an outfit plugin into parts (and shrink illustrations).')
    ap.add_argument('plugin', help='the extracted plugin folder (part 1)')
    ap.add_argument('--parts', type=int, default=2)
    ap.add_argument('--illust-max', type=int, default=896, help='largest illustration side (0 keeps it)')
    ap.add_argument('--illust-quality', type=int, default=78)
    ap.add_argument('--skip-shrink', action='store_true', help='do not re-encode illustrations (a resumed run)')
    args = ap.parse_args(argv)

    root = Path(args.plugin)
    overlay = json.loads((root / 'overlay.json').read_text(encoding='utf-8'))
    plugin = json.loads((root / 'plugin.json').read_text(encoding='utf-8'))
    chars = overlay.get('chars') or {}
    if args.parts < 1 or args.parts > 16:
        sys.exit('--parts must be 1..16')

    if not args.skip_shrink:
        shrink_illusts(root, overlay, args.illust_max, args.illust_quality, print)

    bins = partition(chars, overlay, root, args.parts)
    folders = [root] + [root.with_name(f'{root.name}-{i}') for i in range(2, args.parts + 1)]
    for i, (folder, ids) in enumerate(zip(folders, bins), 1):
        if i > 1:
            move_part(root, folder, ids, print)
        write_part(folder, plugin, overlay, ids, i, args.parts)

    for folder in folders:
        size = sum(p.stat().st_size for p in folder.rglob('*') if p.is_file())
        print(f'{folder}: {size / 1048576:.1f} MB')
    print('next: node tools/plugin.mjs pack <each part>  # then check')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
