"""Read a Windows client's active hot update over its packaged bundles, without modifying either tree."""
import json
import os
import shutil
import tempfile
from contextlib import contextmanager
from pathlib import Path, PurePosixPath


def resource_index(path):
    doc = json.loads(path.read_text(encoding='utf-8'))
    records = {}
    for rec in doc['abInfos']:
        name = rec['name']
        rel = PurePosixPath(name)
        if rel.is_absolute() or '..' in rel.parts or '\\' in name or ':' in name:
            raise ValueError(f'unsafe bundle path: {name}')
        records[name] = rec
    return doc, records


def link_tree(root, selected):
    """Lay `selected` (name → source path) out under `root`, one link per file (copy when links are unavailable)."""
    root.mkdir(parents=True, exist_ok=True)
    for name, src in selected.items():
        dst = root / name
        dst.parent.mkdir(parents=True, exist_ok=True)
        try:
            dst.symlink_to(src)
        except OSError:  # Windows may disallow symlinks; a hard link or temporary copy is read identically.
            try:
                os.link(src, dst)
            except OSError:
                shutil.copy2(src, dst)


@contextmanager
def client_bundles(base, log=print, cache_root=None):
    """The active indexes, not mtimes, select downloaded replacements. Missing updates never use stale base art.

    A linked tree (cached under `cache_root` when given, else temporary) lets every existing job — including
    multiprocessing FX dependency scans — see one root.
    PlayCover, archived bundles and base-only installs retain their original paths.
    """
    base = Path(base).resolve()
    if base.parts[-3:] != ('StreamingAssets', 'AB', 'Windows'):
        yield base
        return
    hot = base.parents[2] / 'PersistentData' / 'Bundles'
    if not (hot / 'hot_update_list.json').is_file() or not (hot / 'persistent_res_list.json').is_file():
        yield base
        return
    current, active = resource_index(hot / 'hot_update_list.json')
    packaged, original = resource_index(base / 'hot_update_list.json')
    downloaded, installed = resource_index(hot / 'persistent_res_list.json')
    # The client's timestamp-prefixed version ids order releases; an old download cache cannot override a new base.
    if current['versionId'][:17] < packaged['versionId'][:17]:
        yield base
        return
    if (downloaded.get('manifestName'), downloaded.get('manifestVersion')) != (
            current.get('manifestName'), current.get('manifestVersion')):
        raise ValueError('hot update and installed resource indexes disagree')
    selected, updated, missing = {}, 0, 0
    for name, rec in active.items():
        src = None
        if installed.get(name, {}).get('hash') == rec['hash'] and (hot / name).is_file():
            src = hot / name
            updated += 1
        elif original.get(name, {}).get('hash') == rec['hash'] and (base / name).is_file():
            src = base / name
        if src is not None:
            selected[name] = src
        else:
            missing += 1
    selected['hot_update_list.json'] = hot / 'hot_update_list.json'
    log(f'client bundles: {packaged["versionId"]} + {current["versionId"]}; '
        f'{updated} downloaded, {len(selected) - 1 - updated} packaged, {missing} unavailable')

    # A cached linked tree (one per pair of version ids) beats a temporary one: a loaded bundle keeps its file open on
    # Windows, so deleting the tree on exit fails; the links cost nothing and the next run reuses them.
    if cache_root:
        tree = Path(cache_root) / f'{packaged["versionId"]}+{current["versionId"]}'
        root = tree / 'Windows'
        if not (tree / 'ready').is_file():
            shutil.rmtree(tree, ignore_errors=True)
            link_tree(root, selected)
            (tree / 'ready').write_text('ok', encoding='utf-8')
        yield root
        return
    # No cache: a temporary directory beside the download cache (writable, same drive — hard links need one volume);
    # the system temp dir is the fallback (a copy). A loaded bundle can keep the tree from being removed on Windows.
    tmp = None
    for parent in (hot.parent, None):
        try:
            tmp = tempfile.TemporaryDirectory(prefix='sp-client-bundles-', dir=str(parent) if parent else None,
                                               ignore_cleanup_errors=True)
            break
        except OSError:
            continue
    with tmp as tmpdir:
        root = Path(tmpdir) / 'Windows'
        link_tree(root, selected)
        yield root
