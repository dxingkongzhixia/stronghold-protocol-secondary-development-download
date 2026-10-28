#!/usr/bin/env python3
"""Extract dynamic illustrations (动态皮肤 / L2D) from the official client into web-ready Spine sets.

The official client ships each dynamic outfit as an AssetBundle under `arts/dynchars/<skinId>.ab` (the file name is
the skin id with `@` written as `_`, e.g. `char_1038_whitw2_sale#15.ab`). It carries a Spine skeleton
(`dyn_illust_<skinId>.skel`), its atlas and page textures. This script keeps the main illustration skeleton (the idle
loop), rewrites the atlas pages to plain WebP files, and writes an `entry.json` plus the `index.json` the hub reads.

One outfit (docs/ASSETS.md 「动态皮肤」):
  py -3.14 tools/local-extract/dynillust.py `
    --bundle "<client>\\...\\arts\\dynchars\\char_1038_whitw2_sale#15.ab" `
    --id "char_1038_whitw2@sale#15" --char char_1038_whitw2 --name 无序的谦卑 --group 忒斯特收藏/XVII

Every outfit in a client (resumable; existing entries are kept unless --force):
  py -3.14 tools/local-extract/dynillust.py --all `
    --dynchars "<client>\\Arknights_Data\\PersistentData\\Bundles\\arts\\dynchars"

The output is machine-local art (`public/assets/dynillust/` is git-ignored): the repository never carries official
skin art. `index.json` is the list the client fetches; re-running replaces/refreshes one entry.
"""
import argparse
import hashlib
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
GAMEDATA = ROOT / '.cache' / 'gamedata' / 'excel'


def slug(text):
    return SAFE.sub('_', str(text)).strip('_') or 'dyn'


def read_bundle(path):
    """TextAssets (name -> list of bytes, in bundle order) and Texture2Ds (name -> PIL.Image) of one bundle.

    A bundle may carry the same asset name twice — some outfits ship a full model and a simplified/lower one under the
    same names (e.g. `char_172_svrash_ambiencesynesthesia#4`: 1.0 MB skeleton + 325-region atlas, and a 150 KB one +
    104-region atlas). `extract_one` pairs them by matching atlas region names, so the order is kept here.
    """
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
            raw = raw.encode('utf-8', 'surrogateescape') if isinstance(raw, str) else bytes(raw)
            texts.setdefault(name, []).append(raw)
        elif obj.type.name == 'Texture2D':
            try:
                textures.setdefault(name, []).append(data.image.convert('RGBA'))
            except Exception as exc:  # a texture that cannot be decoded is skipped, the atlas check reports it
                print(f'  ! texture {name}: {exc}')
    return texts, textures


def first(raws):
    return raws[0] if raws else None


def atlas_regions(atlas_text):
    """Region names of an atlas: the un-indented lines that are not page names / headers."""
    out = []
    for ln in atlas_text.splitlines():
        if not ln or ln[0].isspace() or ln.endswith('.png'):
            continue
        if ln.startswith(('size:', 'format:', 'filter:', 'repeat:', 'pma:')):
            continue
        out.append(ln.strip())
    return out


def atlas_page_sizes(atlas_text):
    """Page file name -> declared (width, height) from the `size:` line under it."""
    lines = atlas_text.splitlines()
    sizes = {}
    for i, ln in enumerate(lines):
        if not ln or ln[0].isspace() or not ln.endswith(('.png', '.webp')):
            continue
        for nxt in lines[i + 1:i + 4]:
            s = nxt.strip()
            if s.startswith('size:'):
                try:
                    w, h = s.split(':', 1)[1].strip().split(',')
                    sizes[ln.strip()] = (int(w), int(h))
                except ValueError:
                    pass
                break
    return sizes


def scale_atlas(atlas_text, page, ratio):
    """Scale one page's regions after downscaling its texture, so the atlas UVs still line up."""
    if ratio >= 1:
        return atlas_text
    lines = atlas_text.splitlines()
    out = []
    in_page = False
    page_size_done = False
    for ln in lines:
        s = ln.strip()
        if not ln:
            out.append(ln)
            continue
        unindented = not ln[0].isspace()
        if unindented and s.endswith(('.png', '.webp')):
            in_page = s == page
            page_size_done = False
            out.append(ln)
            continue
        # page metadata (size/format/filter/repeat) is NOT indented in a Spine atlas; region fields are.
        if in_page and s.startswith(('size:', 'xy:', 'orig:', 'offset:')):
            is_page_size = s.startswith('size:') and not page_size_done
            key, val = s.split(':', 1)
            try:
                nums = [str(max(0, round(float(p) * ratio))) if p.strip() else p.strip() for p in val.split(',')]
            except ValueError:
                out.append(ln)
                continue
            out.append(('' if unindented else '  ') + f'{key}: ' + ','.join(nums))
            if is_page_size:
                page_size_done = True
            continue
        out.append(ln)
    return '\n'.join(out) + ('\n' if atlas_text.endswith('\n') else '')


def atlas_pages(atlas_text):
    """Page file names of an atlas (the un-indented lines ending in .png)."""
    return [ln.strip() for ln in atlas_text.splitlines() if ln and not ln[0].isspace() and ln.strip().endswith('.png')]


def skin_key(stem, table):
    """Bundle stem -> skin_table key (`char_x_name_series#n` -> `char_x_name@series#n`; `char_x_name_2` -> `#2`)."""
    if stem in table:
        return stem
    cut = stem.find('_', 5)  # after `char_`
    cut = stem.find('_', cut + 1)  # after `char_<num>_<name>`
    if cut < 0:
        return None
    char_id, rest = stem[:cut], stem[cut + 1:]
    if '#' in rest:
        for cand in (f'{char_id}@{rest}', f'{char_id}_{rest}'):
            if cand in table:
                return cand
    cand = f'{char_id}#{rest}'
    return cand if cand in table else None


def meta_for(stem, table, chars):
    key = skin_key(stem, table)
    row = table.get(key) if key else None
    char_id = (row or {}).get('charId') or stem.split('_')[0] + '_' + stem.split('_')[1] + '_' + stem.split('_')[2]
    display = (row or {}).get('displaySkin') or {}
    name = display.get('skinName') or ''
    group = display.get('skinGroupName') or ''
    if not name:
        name = (chars.get(char_id) or {}).get('name') or char_id
        name = f'{name} · 精英二' if key and key.endswith('#2') else name
    return key or stem, char_id, name, group


def poster_for(skin_id, char_id):
    """The static outfit illustration already unpacked by skins.py, when it exists (served under /skins/sets)."""
    rel = f'local-skins/media/{char_id}/{slug(skin_id)}_illust.webp'
    return f'/skins/sets/{rel}' if (ROOT / 'skins' / 'sets' / rel).is_file() else None


def is_skeleton(raw):
    """A Spine binary/skeleton payload: the version string sits near the front (3.8.99 / 4.0.x / 4.1.x)."""
    head = raw[:96]
    return b'3.8.' in head or b'4.0.' in head or b'4.1.' in head or raw[:1] == b'{'


def pick_atlas(texts, stem):
    """The atlas of a skeleton stem: same name first; some E2 bundles name it after the base art
    (`dyn_illust_x_nian.atlas` for `x_nian2`). A duplicated name (a full + a simplified model in one bundle) keeps the
    atlas with the most regions — that is the full one."""
    exact = [(n, raw) for n in texts if n == f'{stem}.atlas' for raw in texts[n]]
    cands = exact or [(n, raw) for n, raws in texts.items()
                      if n.startswith('dyn_illust_') and n.endswith('.atlas') and not n.endswith('_Start.atlas')
                      for raw in raws]
    if not cands:
        return None
    name, raw = max(cands, key=lambda x: len(atlas_regions(x[1].decode('utf-8', 'surrogateescape'))))
    return name, raw.decode('utf-8', 'surrogateescape')


def pick_skeletons(texts, keep_start):
    """One skeleton per role: the largest occurrence of each stem (a bundle can carry a full + a simplified model)."""
    by_stem = {}
    for name, raws in texts.items():
        if not name.startswith('dyn_illust_') or name.endswith('.atlas'):
            continue
        stem = name[:-5] if name.endswith('.skel') else name
        is_start = stem.endswith('_Start')
        if is_start and not keep_start:
            continue
        raws = [r for r in raws if is_skeleton(r)]
        if not raws:
            continue
        if stem not in by_stem or len(max(raws, key=len)) > len(by_stem[stem]):
            by_stem[stem] = max(raws, key=len)
    return sorted(by_stem.items(), key=lambda x: (x[0].endswith('_Start'), x[0]))


def extract_one(bundle, skin_id, out_root, quality, keep_start, meta, max_page=1600):
    """Write one outfit's main Spine set and return its index record."""
    print(f'reading {bundle.name} ({bundle.stat().st_size} bytes)')
    texts, textures = read_bundle(bundle)
    wanted = pick_skeletons(texts, keep_start)
    if not wanted:
        raise RuntimeError('no dyn_illust_*.skel in the bundle')

    out_dir = out_root / slug(skin_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    parts = []
    for stem, raw in wanted:
        picked = pick_atlas(texts, stem)
        if not picked:
            raise RuntimeError(f'missing {stem}.atlas')
        atlas_name, atlas_text = picked
        pages = atlas_pages(atlas_text)
        if not pages:
            raise RuntimeError(f'{atlas_name}: no page textures')
        sizes = atlas_page_sizes(atlas_text)
        missing = [p for p in pages if not textures.get(p[:-4])]
        if missing:
            raise RuntimeError(f'{atlas_name}: missing textures {missing}')

        part = 'start' if stem.endswith('_Start') else 'main'
        part_dir = out_dir / part
        part_dir.mkdir(parents=True, exist_ok=True)
        page_files = []
        for i, page in enumerate(pages):
            # A bundle can carry the same page name twice (full art + a smaller variant): use the one whose pixels
            # match the atlas `size:` line, and pad/crop when no copy matches exactly.
            want = sizes.get(page)
            cands = textures[page[:-4]]
            image = next((im for im in cands if want and im.size == want), None)
            if image is None:
                image = max(cands, key=lambda im: im.size[0] * im.size[1])
                if want:
                    canvas = Image.new('RGBA', want, (0, 0, 0, 0))
                    canvas.paste(image, (0, 0))
                    image = canvas
            elif want and image.size != want:
                image = image.crop((0, 0, want[0], want[1]))
            if max_page and max(image.size) > max_page:
                ratio = max_page / max(image.size)
                image = image.resize((max(1, round(image.width * ratio)), max(1, round(image.height * ratio))), Image.LANCZOS)
                atlas_text = scale_atlas(atlas_text, page, ratio)
            out_page = f'page{i}.webp' if len(pages) > 1 else 'page.webp'
            image.save(part_dir / out_page, 'WEBP', quality=quality, method=6, alpha_quality=100)
            page_files.append(out_page)
            atlas_text = re.sub(rf'(?m)^{re.escape(page)}\s*$', out_page, atlas_text)

        # JSON skeletons (some bundles strip the .skel extension and store the JSON form) must keep the .json name:
        # pixi-spine picks the parser by extension and derives the atlas as `<basename>.atlas`.
        skel_file = 'illust.json' if raw[:1] == b'{' else 'illust.skel'
        for other in ('illust.skel', 'illust.json'):
            if other != skel_file and (part_dir / other).is_file():
                (part_dir / other).unlink()
        (part_dir / skel_file).write_bytes(raw)
        (part_dir / 'illust.atlas').write_text(atlas_text, encoding='utf-8')
        digest = hashlib.sha1()
        for f in [part_dir / skel_file, part_dir / 'illust.atlas', *[part_dir / p for p in page_files]]:
            digest.update(f.read_bytes())
        parts.append({
            'part': part,
            'skel': f'{slug(skin_id)}/{part}/{skel_file}',
            'atlas': f'{slug(skin_id)}/{part}/illust.atlas',
            'textures': [f'{slug(skin_id)}/{part}/{p}' for p in page_files],
            'v': digest.hexdigest()[:12],
        })
        print(f'  {part}: {len(page_files)} page(s); atlas {len(atlas_text)} bytes; {skel_file}')

    char_id, name, group = meta
    entry = {
        'id': skin_id,
        'charId': char_id,
        'name': name,
        'group': group,
        'poster': poster_for(skin_id, char_id),
        'parts': parts,
    }
    (out_dir / 'entry.json').write_text(json.dumps(entry, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return entry


def extract_scene_backdrops(out_root, entries, bundles, table, chars, max_edge=1280):
    """Use the outfit's own scene render from the dynamic bundle as the room behind the Spine.

    Every dynchars prefab also carries the room as textures (the largest one that is not an atlas page — e.g. the 2048²
    bar render). Unlike the static illustration it has no character in it, so it can sit sharp-ish behind the animated
    one; the client blurs it into the backdrop.
    """
    by_id = {}
    for stem, path in bundles.items():
        by_id.setdefault(meta_for(stem, table, chars)[0], path)
    done = 0
    for e in entries:
        path = by_id.get(e['id'])
        if not path:
            continue
        out = out_root / slug(e['id']) / 'backdrop.webp'
        try:
            env = UnityPy.load(str(path))
            pages = set()
            for obj in env.objects:
                if obj.type.name != 'TextAsset':
                    continue
                d = obj.read()
                if not d.m_Name.endswith('.atlas'):
                    continue
                raw = d.m_Script
                raw = raw.encode('utf-8', 'surrogateescape') if isinstance(raw, str) else bytes(raw)
                for p in atlas_pages(raw.decode('utf-8', 'surrogateescape')):
                    pages.add(p)
                    pages.add(p[:-4])
            best = None
            for obj in env.objects:
                if obj.type.name != 'Texture2D':
                    continue
                d = obj.read()
                if d.m_Width < 1024 or d.m_Name in pages or d.m_Name.startswith('build_'):
                    continue
                # Atlas pages / portrait pages / the [alpha] variants are the character, not the room. The room renders
                # are named *_bg*, bg, live_*, l2d_* etc.; exclude the illustration page families outright.
                if d.m_Name.startswith(('dyn_illust_', 'dyn_portrait_', 'dyn_')) or '[alpha]' in d.m_Name:
                    continue
                if best is None or d.m_Width * d.m_Height > best[1] * best[2]:
                    best = (d, d.m_Width, d.m_Height)
            if not best:
                continue
            img = best[0].image.convert('RGBA')
            if max(img.size) > max_edge:
                r = max_edge / max(img.size)
                img = img.resize((max(1, round(img.width * r)), max(1, round(img.height * r))), Image.LANCZOS)
            out.parent.mkdir(parents=True, exist_ok=True)
            img.save(out, 'WEBP', quality=82, method=6, alpha_quality=100)
            e['backdrop'] = f'/assets/dynillust/{slug(e["id"])}/backdrop.webp'
            e['backdropFrom'] = best[0].m_Name
            (out.parent / 'entry.json').write_text(json.dumps(e, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
            done += 1
            print(f'  scene backdrop {e["id"]} <- {best[0].m_Name} {img.size}')
        except Exception as exc:
            print(f'  ! scene backdrop {e["id"]}: {exc}')
    print(f'scene backdrops: {done}')


def extract_backdrops(out_root, entries, skinpacks, max_edge=1280, chararts=None):
    """Use each outfit's official static illustration as the blurred scene behind the L2D.

    The dynamic-illustration prefab draws its room from Unity meshes, which pixi-spine cannot render; the outfit's own
    illustration carries the same palette, props and light, so the client blurs it into the backdrop instead of black.
    Sources: `skinpack/<charId>.ab` (outfits) and `chararts/<charId>.ab` (elite-2 art, which skinpack does not carry).
    """
    if not skinpacks and not chararts:
        return
    sources = list(skinpacks) + list(chararts or [])
    by_char = {}
    for e in entries:
        if not e.get('charId'):
            continue
        slug_id = slug(e['id'])
        if e.get('backdrop') and (out_root / slug_id / 'backdrop.webp').is_file():
            continue
        by_char.setdefault(e['charId'], []).append(e)
    norm = lambda s: re.sub(r'[^A-Za-z0-9]+', '_', s).strip('_').lower()
    for char_id, group in by_char.items():
        bundles = []
        # Amiya's outfits live under `char_1037_amiya3` / `char_1001_amiya2` even though skin_table reports
        # `char_002_amiya` for them: try the outfit id's own prefix as well.
        wanted_ids = {char_id} | {re.split(r'[@#]', e['id'])[0] for e in group}
        for cid in wanted_ids:
            for root in sources:
                p = Path(root) / f'{cid}.ab'
                if p.is_file():
                    bundles.append(p)
        if not bundles:
            continue
        print(f'backdrops: {char_id} ({len(group)})')
        textures = []
        seen = set()
        for bundle in bundles:
            env = UnityPy.load(str(bundle))
            for obj in env.objects:
                if obj.type.name != 'Texture2D':
                    continue
                try:
                    d = obj.read()
                    if d.m_Width < 512 or d.m_Name.startswith('build_'):
                        continue
                    key = (d.m_Name, d.m_Width)
                    if key in seen:
                        continue
                    seen.add(key)
                    textures.append((d.m_Name, d.image.convert('RGBA')))
                except Exception:
                    continue
        for e in group:
            want = norm(e['id'])
            cand = [t for t in textures if norm(t[0]) == want]
            if not cand:
                continue
            name, img = max(cand, key=lambda t: t[1].width * t[1].height)
            if max(img.size) > max_edge:
                r = max_edge / max(img.size)
                img = img.resize((max(1, round(img.width * r)), max(1, round(img.height * r))), Image.LANCZOS)
            d = out_root / slug(e['id'])
            d.mkdir(parents=True, exist_ok=True)
            img.save(d / 'backdrop.webp', 'WEBP', quality=80, method=6, alpha_quality=100)
            e['backdrop'] = f'/assets/dynillust/{slug(e["id"])}/backdrop.webp'
            (d / 'entry.json').write_text(json.dumps(e, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
            print(f'  {e["id"]} <- {name} {img.size}')


def load_json(path, fallback):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except Exception:
        return fallback


def write_index(out_root, entries):
    entries = sorted(entries, key=lambda e: ((e.get('group') or ''), (e.get('name') or e.get('id') or '')))
    path = out_root / 'index.json'
    path.write_text(json.dumps({'version': 1, 'entries': entries}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'wrote {path} ({len(entries)} entries)')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--bundle', help='one arts/dynchars/<skinId>.ab')
    ap.add_argument('--id', help='skin id for --bundle, e.g. char_1038_whitw2@sale#15')
    ap.add_argument('--char', default='', help='operator charId (info only)')
    ap.add_argument('--name', default='', help='display name (info only)')
    ap.add_argument('--group', default='', help='skin group (info only)')
    ap.add_argument('--all', action='store_true', help='extract every *.ab of --dynchars (resumable)')
    ap.add_argument('--dynchars', action='append', default=[], help='a dynchars folder; repeatable (later wins)')
    ap.add_argument('--table', default=str(GAMEDATA / 'skin_table.json'), help='skin_table.json for names')
    ap.add_argument('--chars', default=str(GAMEDATA / 'character_table.json'), help='character_table.json for names')
    ap.add_argument('--out', default=str(ROOT / 'public' / 'assets' / 'dynillust'), help='output root')
    ap.add_argument('--quality', type=int, default=92, help='WebP quality (alpha is kept)')
    ap.add_argument('--keep-start', action='store_true', help='also keep the _Start (entrance) skeleton')
    ap.add_argument('--force', action='store_true', help='re-extract outfits that are already on disk')
    ap.add_argument('--max-page', type=int, default=1600, help='downscale atlas pages above this edge (0 = keep)')
    ap.add_argument('--skinpack', action='append', default=[],
                    help='skinpack folder for the blurred official background; repeatable')
    ap.add_argument('--chararts', action='append', default=[],
                    help='chararts folder (elite-2 illustrations); repeatable')
    ap.add_argument('--backdrop-edge', type=int, default=1280, help='max edge of the blurred background')
    args = ap.parse_args()

    out_root = Path(args.out)
    out_root.mkdir(parents=True, exist_ok=True)
    table = load_json(args.table, {}).get('charSkins', {})
    chars = load_json(args.chars, {})

    if args.all:
        bundles = {}
        for folder in args.dynchars:
            root = Path(folder)
            if not root.is_dir():
                sys.exit(f'no such dynchars folder: {root}')
            for p in sorted(root.glob('*.ab')):
                if p.stem == 'effect':
                    continue
                bundles[p.stem] = p  # a later folder (a newer client) wins
        if not bundles:
            sys.exit('no *.ab under --dynchars')
        entries, failed = [], []
        for i, (stem, bundle) in enumerate(bundles.items(), 1):
            skin_id, char_id, name, group = meta_for(stem, table, chars)
            entry_file = out_root / slug(skin_id) / 'entry.json'
            main = out_root / slug(skin_id) / 'main'
            has_skel = (main / 'illust.skel').is_file() or (main / 'illust.json').is_file()
            if entry_file.is_file() and has_skel and not args.force:
                entry = load_json(entry_file, {})
                entry['name'], entry['group'] = name, group
                # keep a generated 16:9 poster; only fall back to the local-skins illustration when there is none
                if not (out_root / slug(skin_id) / 'poster.webp').is_file():
                    entry['poster'] = poster_for(skin_id, char_id)
                if (out_root / slug(skin_id) / 'backdrop.webp').is_file():
                    entry['backdrop'] = f'/assets/dynillust/{slug(skin_id)}/backdrop.webp'
                entry_file.write_text(json.dumps(entry, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
                entries.append(entry)
                print(f'[{i}/{len(bundles)}] kept {skin_id}')
                continue
            print(f'[{i}/{len(bundles)}] {skin_id}  ({name} · {group})')
            try:
                entries.append(extract_one(bundle, skin_id, out_root, args.quality, args.keep_start,
                                           (char_id, name, group), args.max_page))
            except Exception as exc:
                failed.append((skin_id, str(exc)))
                print(f'  ! {skin_id}: {exc}')
                # keep a previously extracted copy of this outfit in the index
                if entry_file.is_file() and has_skel:
                    entries.append(load_json(entry_file, {}))
        extract_scene_backdrops(out_root, entries, bundles, table, chars)
        # No static-illustration fallback: a blurred copy of the outfit looks like a ghost and is not a room. Outfits
        # without a scene render keep the hub's dark base (the `hub-bg__dyn` gradient).
        write_index(out_root, entries)
        if failed:
            print('failed:', ', '.join(f'{i} ({e})' for i, e in failed))
            sys.exit(1)
        return

    if not args.bundle or not args.id:
        ap.error('--bundle and --id are required unless --all is given')
    bundle = Path(args.bundle)
    if not bundle.is_file():
        sys.exit(f'no such bundle: {bundle}')
    key, mchar, mname, mgroup = meta_for(bundle.stem, table, chars)
    skin_id = key or args.id
    char_id = args.char or mchar
    name = args.name or mname
    group = args.group or mgroup
    entry = extract_one(bundle, skin_id, out_root, args.quality, args.keep_start, (char_id, name, group), args.max_page)
    extract_scene_backdrops(out_root, [entry], {bundle.stem: bundle}, table, chars)
    # no static-illustration fallback (see the --all path): outfits without a scene render keep the hub's dark base
    index_path = out_root / 'index.json'
    index = load_json(index_path, {'version': 1, 'entries': []})
    entries = [e for e in index.get('entries', []) if e.get('id') != entry['id']]
    entries.append(entry)
    write_index(out_root, entries)


if __name__ == '__main__':
    main()



