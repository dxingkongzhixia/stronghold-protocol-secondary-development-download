#!/usr/bin/env python3
"""Unpack the battlefield bundles a running official client downloaded into an `extract.py --scenes` directory.

The launcher caches every downloaded bundle as a zip under
`<install>/Arknights_Data/PersistentData/HGDownload/<version>/<bundle path, '/' -> '_'>.dat_<hash>_<n>`,
whose single entry is the `.ab` at its original bundle path. The scene/regulation exporters read bundles
from a plain directory of that layout (`extract.py --scenes <dir>`), so this script unpacks them there —
no network, no UnityPy, only the standard library.

Usage:
  python tools/local-extract/import_scenes.py --from-client <.../Arknights_Data> [--out <dir>] [--match <text>]

  --from-client  the client's `Arknights_Data` folder (the one with `PersistentData/HGDownload`)
  --out          the scenes directory (default: .cache/official-scenes/imported)
  --match        only entry names containing this text (e.g. `act3autochess`); default: every bundle
  --list         print what would be unpacked, write nothing

Exit codes: 0 imported (or nothing to do), 1 a zip failed.
"""
import argparse
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def downloaded(client_data):
    """The cached bundle zips of a client: HGDownload/<version>/<file> (version folders newest name first)."""
    root = Path(client_data) / 'PersistentData' / 'HGDownload'
    if not root.is_dir():
        return []
    out = []
    for version in sorted((p for p in root.iterdir() if p.is_dir()), reverse=True):
        out.extend(p for p in version.iterdir() if p.is_file() and p.stat().st_size > 0)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--from-client', required=True, metavar='DIR', help="the client's Arknights_Data folder")
    ap.add_argument('--out', default=str(ROOT / '.cache' / 'official-scenes' / 'imported'), metavar='DIR')
    ap.add_argument('--match', default='', metavar='TEXT', help='only bundle paths containing this text')
    ap.add_argument('--list', action='store_true', help='print the bundles and sizes, write nothing')
    args = ap.parse_args()

    out = Path(args.out)
    files = downloaded(args.from_client)
    if not files:
        print(f'no downloaded bundles under {Path(args.from_client) / "PersistentData" / "HGDownload"}', file=sys.stderr)
        return 1
    imported = kept = failed = 0
    for f in files:
        try:
            with zipfile.ZipFile(f) as z:
                for name in z.namelist():
                    if not name.lower().endswith('.ab') or args.match and args.match not in name:
                        continue
                    blob = z.read(name)
                    if args.list:
                        print(f'{len(blob):>9}  {name}')
                        kept += 1
                        continue
                    dst = out / name
                    if dst.is_file() and dst.stat().st_size == len(blob):
                        kept += 1
                        continue
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    dst.write_bytes(blob)
                    imported += 1
        except zipfile.BadZipFile:
            failed += 1  # not a downloaded bundle (the sdk config and similar files share the folder)
    if args.list:
        print(f'{kept} bundle(s) match{" " + args.match if args.match else ""}')
    else:
        print(f'done: {imported} imported, {kept} already present, {failed} not a zip; {out}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
