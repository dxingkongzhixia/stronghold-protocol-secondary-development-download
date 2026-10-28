"""Local official outfits (皮肤) for our own operators, as a machine-local cosmetic plugin.

The official client ships each operator's alternative outfits in `skinpack/<charId>.ab`
(battle Spine prefab + illustration), the portraits in `spritepack/char_portrait_*.ab`
and the small avatars in `spritepack/ui_char_avatar_*.ab`. `excel/skin_table.json`
(Kengxxiao/ArknightsGameData, the same cache build-data uses) names them.

This writes `plugins/<id>/` — a cosmetic plugin whose overlay is
`chars[<charId>].skins[<skinId>] = { name, group, avatar, portrait, illust, spine }`.
The folder is git-ignored (`plugins/*`): no official art ever enters the repository,
and the server still never installs anything by itself (docs/SKINS.md).

  python tools/local-extract/skins.py --game <.../AB/Windows> [--table <skin_table.json>]
         [--out plugins/local-skins] [--id local-skins] [--only char_101_sora,...]
         [--limit N] [--quality 88] [--lossless] [--dry-run]

After it finishes:

  node tools/plugin.mjs pack  plugins/local-skins     # plugin.lock.json (Spine clips, hashes)
  node tools/plugin.mjs check plugins/local-skins

Then switch the plugin on in 设置 → 外观插件 (a purely personal choice: no room can
force a skin on anyone, docs/SKINS.md). The 皮肤 picker appears only once a wear-able
skin is in the composed manifest (public/js/ui/skins.js hasAnySkinChoices).
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

SKIN_ID = re.compile(r'^[A-Za-z0-9_][A-Za-z0-9_@#+.-]{0,63}$')
SAFE = re.compile(r'[^A-Za-z0-9_.-]+')
DEFAULT_SKIN = re.compile(r'^[^@]+#\d+$')
PICTURES = {'portrait': r'spritepack/char_portrait_*.ab', 'avatar': r'spritepack/ui_char_avatar_*.ab'}


def safe(text):
    return SAFE.sub('_', str(text)).strip('_') or 'skin'


def load_json(path):
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def our_chars():
    """The charIds this installation's operator roster has — shared/protocol.js operatorCharIds:
    chess records' charIds, backups units, and the DIY owned pool / operators."""
    ids = set()
    try:
        chess = load_json(ROOT / 'data' / 'chess.json')
        for c in chess.values():
            if isinstance(c, dict) and isinstance(c.get('charId'), str):
                ids.add(c['charId'])
    except OSError:
        pass
    try:
        backups = load_json(ROOT / 'data' / 'backups.json')
        units = backups.get('units') or {}
        if isinstance(units, dict):
            ids.update(k for k in units if isinstance(k, str))
        diy = backups.get('diy') or {}
        for cid in diy.get('ownedPool') or []:
            if isinstance(cid, str):
                ids.add(cid)
        if isinstance(diy.get('operators'), dict):
            ids.update(k for k in diy['operators'] if isinstance(k, str))
    except OSError:
        pass
    return ids


def first_bundle(roots, rel):
    """The hot-updated file when there is one, else the base install's (roots: updates first, base last)."""
    for root in roots:
        p = Path(root) / rel
        if p.is_file():
            return p
    return None


def list_bundles(roots, pattern):
    """Every bundle matching `pattern` across the roots, one per file name (the update shadows the base)."""
    found = {}
    for root in roots:
        for p in sorted(Path(root).glob(pattern)):
            found.setdefault(p.name, p)
    return [found[k] for k in sorted(found)]


def plan(table, chars, roots, only=None, limit=None):
    """The alternative outfits (`<charId>@<series>#<n>`) this install can wear.

    Default skins (`<charId>#1`), token outfits and operators absent from the manifest are
    skipped; a missing `skinpack/<charId>.ab` is skipped too (a partial game install).
    """
    jobs, skipped = [], {'default': 0, 'token': 0, 'not-ours': 0, 'no-bundle': 0, 'no-battle': 0, 'no-id': 0}
    wanted = set(only or [])
    for skin in (table.get('charSkins') or {}).values():
        if not isinstance(skin, dict):
            continue
        skin_id, char_id = skin.get('skinId'), skin.get('charId')
        if not skin_id or not char_id:
            continue
        if str(skin_id).startswith('token_'):
            skipped['token'] += 1
            continue
        if DEFAULT_SKIN.match(skin_id) and '@' not in skin_id:
            skipped['default'] += 1
            continue
        if '@' not in skin_id:
            skipped['no-id'] += 1
            continue
        if wanted and char_id not in wanted:
            continue
        if char_id not in chars:
            skipped['not-ours'] += 1
            continue
        if not first_bundle(roots, f'skinpack/{char_id}.ab'):
            skipped['no-bundle'] += 1
            continue
        battle = (skin.get('battleSkin') or {}).get('skinOrPrefabId')
        if not battle:
            skipped['no-battle'] += 1
            continue
        if not SKIN_ID.match(skin_id):
            skipped['no-id'] += 1
            continue
        display = skin.get('displaySkin') or {}
        name = (display.get('skinName') or '').strip()
        if not name:
            name = str(skin_id).split('@', 1)[-1].split('#', 1)[0] or '时装'
        jobs.append({
            'skinId': skin_id,
            'charId': char_id,
            'battleId': battle,
            'name': name[:64],
            'group': (display.get('skinGroupName') or '').strip()[:64],
            'avatarId': skin.get('avatarId'),
            'portraitId': skin.get('portraitId'),
            'illustId': skin.get('illustId'),
        })
    jobs.sort(key=lambda j: (j['charId'], j['skinId']))
    if limit:
        jobs = jobs[:limit]
    return jobs, skipped


def save_image(img, target, quality=88, lossless=False, max_side=0):
    target.parent.mkdir(parents=True, exist_ok=True)
    if max_side and max(img.size) > max_side:
        scale = max_side / max(img.size)
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), 1)
    try:
        if lossless:
            img.save(target, 'WEBP', lossless=True, method=6)
        else:
            img.save(target, 'WEBP', quality=quality, method=6)
        return target
    except Exception:
        target = target.with_suffix('.png')
        img.save(target, 'PNG')
        return target


def pictures(roots, jobs, out, log, quality, lossless):
    """Write each skin's portrait and avatar; returns {skinId: {'avatar': rel, 'portrait': rel}}."""
    import aklz4  # noqa: F401  (the local-client decoder must be registered first)
    import UnityPy

    wanted = {}
    for job in jobs:
        for kind, key in (('portrait', job['portraitId']), ('avatar', job['avatarId'])):
            if key:
                wanted[(key, kind)] = job
    found = {}
    for kind, pattern in PICTURES.items():
        keys = {k: v for k, v in wanted.items() if k[1] == kind}
        if not keys:
            continue
        for bundle in list_bundles(roots, pattern):
            if not keys:
                break
            try:
                env = UnityPy.load(str(bundle))
            except Exception as err:
                log(f'warn {bundle.name}: {err}')
                continue
            for obj in env.objects:
                if obj.type.name != 'Sprite':
                    continue
                try:
                    sprite = obj.read()
                    key = (sprite.m_Name, kind)
                    if key not in keys:
                        continue
                    job = keys[key]
                    rel = f'media/{safe(job["charId"])}/{safe(job["skinId"])}_{kind}.webp'
                    rel = save_image(sprite.image, out / rel, quality, lossless).relative_to(out).as_posix()
                    found.setdefault(job['skinId'], {})[kind] = rel
                    del keys[key]
                except Exception as err:
                    log(f'warn {bundle.name} {kind}: {err}')
        for name, _kind in keys:
            log(f'skip {kind}: {name} not found')
    return found


def write_model(objects, sda, out_dir, rel_dir, name, log):
    """One Spine model, written as `<stem>.skel` + `<stem>.atlas` + its pages; a plugin-relative record."""
    from extract import _text_bytes, merge_alpha, normalize_atlas, atlas_pages, safe_name

    def get(pptr):
        return objects.get(pptr['m_PathID']) if pptr and not pptr.get('m_FileID') else None

    skel = get(sda.get('skeletonJSON'))
    if skel is None:
        log(f'  warn {name}: skeleton TextAsset not in this bundle')
        return None
    ta = skel.read()
    stem = safe_name(getattr(ta, 'm_Name', '') or name).removesuffix('.skel')
    texts, pages = [], {}
    for aref in sda.get('atlasAssets') or []:
        aa = get(aref)
        if aa is None:
            continue
        at = aa.read_typetree()
        af = get(at.get('atlasFile'))
        if af is not None:
            texts.append(_text_bytes(af.read()).decode('utf-8', 'replace'))
        for mref in at.get('materials') or []:
            mo = get(mref)
            if mo is None:
                continue
            props = mo.read_typetree()['m_SavedProperties']
            texs = dict(props['m_TexEnvs'])
            straight = dict(props.get('m_Floats') or []).get('_StraightAlphaInput') == 1
            main, alpha = get(texs.get('_MainTex', {}).get('m_Texture')), get(texs.get('_AlphaTex', {}).get('m_Texture'))
            if main is None:
                continue
            mt = main.read()
            pages[safe_name(mt.m_Name) + '.png'] = merge_alpha(
                mt.image, alpha.read().image if alpha is not None else None, straight)
    if not texts or not pages:
        log(f'  warn {name}: atlas or page textures missing')
        return None
    atlas = texts[0] if len(texts) == 1 else '\n\n'.join(t.strip('\n') for t in texts) + '\n'
    names = atlas_pages(atlas)
    if set(names) != set(pages):
        if len(names) != 1 or len(pages) != 1:
            log(f'  warn {name}: atlas pages {names} do not match the textures {sorted(pages)}')
            return None
        pages = {names[0]: next(iter(pages.values()))}
    # Plugin file names take letters, digits, . _ - and spaces only (docs/PLUGINS.md §5): the
    # official page names carry '#' / '@', so rename them and rewrite the atlas that names them.
    renamed, used = {}, set()
    for old in pages:
        new = safe_name(old)
        stem_only, dot, ext = new.rpartition('.')
        n = 2
        while new.lower() in used:
            new = f'{stem_only}_{n}{dot}{ext}'
            n += 1
        used.add(new.lower())
        renamed[old] = new
    for old, new in renamed.items():
        if old != new:
            atlas = atlas.replace(old, new)
    pages = {renamed[old]: img for old, img in pages.items()}
    files = {f'{stem}.skel': _text_bytes(ta),
             f'{stem}.atlas': normalize_atlas(atlas, {p: img.size for p, img in pages.items()}).encode('utf-8')}
    out_dir.mkdir(parents=True, exist_ok=True)
    for fname, blob in files.items():
        (out_dir / fname).write_bytes(blob)
    for fname, img in pages.items():
        img.save(out_dir / fname)
    return {'skel': f'{rel_dir}/{stem}.skel', 'atlas': f'{rel_dir}/{stem}.atlas',
            'textures': [f'{rel_dir}/{p}' for p in sorted(pages)]}


def models(roots, jobs, out, log, quality, lossless, illust_quality=None, illust_max=0):
    """Write the battle Spine models and illustrations from skinpack (<charId>.ab, one load per operator)."""
    import aklz4  # noqa: F401
    import UnityPy

    from extract import prefab_spine_nodes

    illust_quality = illust_quality or quality

    by_char = {}
    for job in jobs:
        by_char.setdefault(job['charId'], []).append(job)
    found = {}
    for char_id, char_jobs in sorted(by_char.items()):
        bundle = first_bundle(roots, f'skinpack/{char_id}.ab')
        if bundle is None:
            continue
        try:
            env = UnityPy.load(str(bundle))
        except Exception as err:
            log(f'warn {char_id}: {err}')
            continue
        objects = {o.path_id: o for o in env.objects}
        sprites = {}
        for obj in env.objects:
            if obj.type.name != 'Sprite':
                continue
            try:
                sprites[obj.read().m_Name] = obj
            except Exception:
                continue
        for job in char_jobs:
            try:
                record = {}
                # the illustration is a Sprite of this same bundle, named like the avatar
                illust = sprites.get(job.get('avatarId')) or sprites.get(job.get('illustId')) if (job.get('avatarId') or job.get('illustId')) else None
                if illust is not None:
                    rel = f'media/{safe(char_id)}/{safe(job["skinId"])}_illust.webp'
                    record['illust'] = save_image(illust.read().image, out / rel, illust_quality, lossless,
                                                  illust_max).relative_to(out).as_posix()
                wanted = f'/{job["battleId"]}.prefab'
                ref = next((v for k, v in env.container.items()
                            if '/battle/prefabs/skins/character/' in k.replace('\\', '/') and k.endswith(wanted)), None)
                if ref is None:
                    log(f'skip spine {job["skinId"]}: prefab not found')
                    if record:
                        found[job['skinId']] = record
                    continue
                nodes = prefab_spine_nodes(ref.read_typetree(), objects)
                front = (next((n for n in nodes if n[0].lower() == 'front'), None)
                         or next((n for n in nodes if n[0].lower() == 'spine'), None)
                         or (nodes[0] if nodes else None))
                back = next((n for n in nodes if n[0].lower() == 'back'), None)
                spine = {}
                for face, node in (('front', front), ('back', back)):
                    if node is None:
                        continue
                    sda = objects.get(node[2]['m_PathID']) if node[2] and not node[2].get('m_FileID') else None
                    if sda is None:
                        log(f'skip spine {job["skinId"]} {face}: skeleton data in another bundle')
                        continue
                    sub = out / 'spine' / safe(char_id) / safe(job['skinId']) / face
                    rel_sub = f'spine/{safe(char_id)}/{safe(job["skinId"])}/{face}'
                    model = write_model(objects, sda.read_typetree(), sub, rel_sub, f'{job["skinId"]} {face}', log)
                    if model:
                        spine[face] = model
                        log(f'{char_id}: {job["skinId"]} {face} -> {rel_sub}')
                if spine:
                    record['spine'] = spine
                if record:
                    found[job['skinId']] = record
            except Exception as err:
                log(f'warn {job["skinId"]}: {err}')
    return found


def salvage(out, jobs):
    """Rebuild the pictures and models an interrupted earlier run already wrote, so a rerun resumes.

    A skin counts as done when its files are on disk: any of portrait/avatar/illust under
    media/<charId>/<skin>_*.webp and a Spine folder with a .skel, its .atlas and pages.
    A character whose skins are not all complete is extracted again (it overwrites its files).
    """
    pics, model_data = {}, {}
    if not out.is_dir():
        return pics, model_data
    for job in jobs:
        sid, cid = job['skinId'], job['charId']
        found = {}
        for kind in ('portrait', 'avatar', 'illust'):
            rel = f'media/{safe(cid)}/{safe(sid)}_{kind}.webp'
            if (out / rel).is_file():
                found[kind] = rel
        if found:
            pics[sid] = found
        spine = {}
        for face in ('front', 'back'):
            folder = out / 'spine' / safe(cid) / safe(sid) / face
            skels = sorted(folder.glob('*.skel')) if folder.is_dir() else []
            if not skels:
                continue
            stem, atlas = skels[0].stem, folder / f'{skels[0].stem}.atlas'
            pages = sorted(p.name for p in folder.glob('*.png'))
            if not atlas.is_file() or not pages:
                continue
            rel = f'spine/{safe(cid)}/{safe(sid)}/{face}'
            spine[face] = {'skel': f'{rel}/{stem}.skel', 'atlas': f'{rel}/{stem}.atlas',
                           'textures': [f'{rel}/{p}' for p in pages]}
        if spine:
            model_data[sid] = {**model_data.get(sid, {}), 'spine': spine}
    return pics, model_data


def plan_tokens(table, roots, only=None):
    """Summon outfits (official `tokenSkinMap`): one job per token skin inside `skinpack/<tokenId>.ab`.

    The bundle that holds a summon's default model also holds the outfit models its owning operators' skins add
    (e.g. `skinpack/token_10007_phatom_twin.ab` carries `token_10007_phatom_twin_sale#4`), so nothing extra is
    downloaded: the container path is `dyn/battle/prefabs/skins/character/<tokenId>/<tokenSkinId>.prefab`.
    """
    wanted = set(only or [])
    jobs, seen = [], set()
    for skin in (table.get('charSkins') or {}).values():
        if not isinstance(skin, dict):
            continue
        maps = skin.get('tokenSkinMap') or []
        if isinstance(maps, dict):
            maps = list(maps.values())
        for m in maps:
            if not isinstance(m, dict):
                continue
            token_id, token_skin = m.get('tokenId'), m.get('tokenSkinId')
            if not token_id or not token_skin or token_skin in seen:
                continue
            owner = skin.get('charId')
            if wanted and owner not in wanted:
                continue
            if not SKIN_ID.match(str(token_skin)):
                continue
            if not first_bundle(roots, f'skinpack/{token_id}.ab'):
                continue
            seen.add(token_skin)
            jobs.append({'charId': token_id, 'skinId': token_skin, 'battleId': token_skin,
                         'name': token_skin, 'group': None, 'token': True, 'ownerSkin': skin.get('skinId')})
    return jobs


def write_plugin(out, plugin_id, jobs, pics, models_found, log):
    """The manifest and its overlay; `assets` points at overlay.json (the schema allows a file)."""
    overlay, count, tokens_map = {'chars': {}}, 0, {}
    for job in jobs:
        if job.get('token'):
            # Summon outfits (official tokenSkinMap): tokens[<tokenId>].skins[<tokenSkinId>], a Spine model only.
            spine = models_found.get(job['skinId'], {}).get('spine')
            if not spine:
                log(f'skip {job["skinId"]}: no model')
                continue
            # Keyed by the OWNER's skin id (tokenSkinMap's owner side): the client looks a summon's outfit up by the
            # operator skin its owner currently wears (docs/SKINS.md).
            key = job.get('ownerSkin') or job['skinId']
            tokens_map.setdefault(job['charId'], {}).setdefault('skins', {})[key] = {'spine': spine}
            count += 1
            continue
        record = {'name': job['name']}
        if job['group']:
            record['group'] = job['group']
        record.update(pics.get(job['skinId'], {}))
        record.update(models_found.get(job['skinId'], {}))
        if 'portrait' not in record and 'illust' not in record and 'spine' not in record:
            log(f'skip {job["skinId"]}: no picture and no model')
            continue
        overlay['chars'].setdefault(job['charId'], {}).setdefault('skins', {})[job['skinId']] = record
        count += 1
    if tokens_map:
        overlay['tokens'] = tokens_map
    out.mkdir(parents=True, exist_ok=True)
    (out / 'overlay.json').write_text(json.dumps(overlay, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    manifest = {
        'manifest': 2,
        'name': {'zh': '官方时装（本机抽取）', 'en': 'Official outfits (local extraction)'},
        'description': {
            'zh': '从本机明日方舟客户端抽取的官方时装。仅供本机使用，不随仓库分发。',
            'en': 'Official outfits extracted from the local Arknights client. Local use only; never shipped with the repository.',
        },
        'version': '1.0.0',
        'app': '>=0.3.0 <0.5.0',
        'api': 2,
        'class': 'cosmetic',
        'scope': ['room', 'personal'],
        'authors': ['local extraction'],
        'license': 'Official art (c) Hypergryph / Yostar; local, non-commercial use only',
        'permissions': ['assets.override', 'assets.add'],
        'assets': 'overlay.json',
    }
    (out / 'plugin.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return count


def main(argv=None):
    ap = argparse.ArgumentParser(description='Extract official outfits into a local cosmetic plugin.')
    ap.add_argument('--game', required=True, help='AssetBundle root (…/Arknights_Data/StreamingAssets/AB/Windows)')
    ap.add_argument('--update', action='append', default=[], metavar='DIR',
                    help='hot-updated bundle root to overlay on the base (repeatable; e.g. Arknights_Data/PersistentData/Bundles)')
    ap.add_argument('--table', default=str(ROOT / '.cache' / 'gamedata' / 'excel' / 'skin_table.json'))
    ap.add_argument('--out', default=None, help='plugin folder (default plugins/<id>)')
    ap.add_argument('--id', default='local-skins', help='plugin id (default local-skins)')
    ap.add_argument('--only', default='', help='comma-separated charIds (pilot; default all ours)')
    ap.add_argument('--limit', type=int, default=0, help='at most N skins (pilot)')
    ap.add_argument('--quality', type=int, default=88, help='WebP quality for pictures (default 88)')
    ap.add_argument('--illust-quality', type=int, default=80, help='WebP quality for illustrations (default 80)')
    ap.add_argument('--illust-max', type=int, default=1024, help='largest illustration side in px (default 1024; 0 keeps the original)')
    ap.add_argument('--lossless', action='store_true', help='lossless WebP for pictures')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--tokens-only', action='store_true',
                    help='extract summon outfits (official tokenSkinMap) only; skip operator skins')
    args = ap.parse_args(argv)

    ab_root = Path(args.game)
    if not (ab_root / 'skinpack').is_dir():
        sys.exit(f'not an AssetBundle root: {ab_root}')
    updates = [Path(p) for p in args.update]
    missing = [str(p) for p in updates if not p.is_dir()]
    if missing:
        sys.exit(f'not a bundle root: {missing[0]}')
    roots = [*updates, ab_root]  # updates shadow the base install
    table = load_json(args.table)
    only = {c.strip() for c in args.only.split(',') if c.strip()}
    jobs, skipped = plan(table, our_chars(), roots, only, args.limit or None) if not args.tokens_only else ([], {})
    token_jobs = plan_tokens(table, roots, only)
    print(f'skins: {len(jobs)}  skipped: {", ".join(f"{k} {v}" for k, v in skipped.items() if v) or "none"}')
    if token_jobs:
        print(f'summon outfits: {len(token_jobs)}')
    if args.dry_run:
        for job in jobs:
            print(f'  {job["charId"]}  {job["skinId"]}  {job["name"]} / {job["group"]}')
        for job in token_jobs:
            print(f'  token  {job["charId"]}  {job["skinId"]}  (owner {job.get("ownerSkin")})')
        return 0
    out = Path(args.out) if args.out else ROOT / 'plugins' / args.id
    pics, model_data = salvage(out, jobs)
    if pics or model_data:
        print(f'resume: {len(pics)} skins with pictures, {len(model_data)} with models already on disk')
    need_pics = [job for job in jobs if job['skinId'] not in pics]
    if need_pics:
        pics.update(pictures(roots, need_pics, out, print, args.quality, args.lossless))
    by_char = {}
    for job in jobs:
        by_char.setdefault(job['charId'], []).append(job)
    todo = {cid for cid, char_jobs in by_char.items()
            if not all(model_data.get(j['skinId'], {}).get('spine') for j in char_jobs)}
    if todo:
        print(f'models: {len(by_char) - len(todo)} operators already done, {len(todo)} to extract')
        model_data.update(models(roots, [j for j in jobs if j['charId'] in todo], out, print,
                                 args.quality, args.lossless, args.illust_quality, args.illust_max))
    if token_jobs:
        _, token_done = salvage(out, token_jobs)
        model_data.update(token_done)
        todo_tokens = [j for j in token_jobs if not model_data.get(j['skinId'], {}).get('spine')]
        print(f'summon outfits: {len(token_jobs) - len(todo_tokens)} done, {len(todo_tokens)} to extract')
        if todo_tokens:
            model_data.update(models(roots, todo_tokens, out, print,
                                     args.quality, args.lossless, args.illust_quality, args.illust_max))
        jobs = [*jobs, *token_jobs]
    written = write_plugin(out, args.id, jobs, pics, model_data, print)
    print(f'wrote {written} skins to {out}')
    print(f'next: node tools/plugin.mjs pack {out.as_posix()}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
