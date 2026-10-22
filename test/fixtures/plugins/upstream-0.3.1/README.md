# Upstream 0.3.1 plugin compatibility fixtures

Copied from the mainline `sganggs/Stronghold-Protocol` commit `c9d804f47`:

- `plugins/_template/content` → `data-demo/` (CC0-1.0)
- `docs/examples/offers-demo` → `offers-demo/` (the example manifest)

They are used only by `test/plugins/upstream-compat.test.js`: the fork must load and
compose mainline Manifest 2 plugins under its own engine, with the app-range warning
and the owner's `allowIncompatible` policy.
