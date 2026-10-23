# 核心皮肤资源 / Core skin assets

This folder makes operator outfits a core feature (docs/SKINS.md), not a cosmetic plugin.

```text
catalogue.json            tracked: names, groups and absolute /skins/sets/… art paths
sets/<set>/overlay.json   local extraction (git-ignored)
sets/<set>/media/…        portraits / avatars / illustrations (git-ignored)
sets/<set>/spine/…        Spine models (git-ignored)
```

The official art is **not committed**: extract it from the local Arknights client and import it with:

```bash
node tools/skins.mjs import <extracted-folder> --id <set> --move
node tools/skins.mjs build
```

The server serves this folder read-only at `/skins/` (`server/http/static.js`); the client loads
`/skins/catalogue.json` once (`public/js/coreSkins.js`) and lays it under any room / personal cosmetic plugin.
