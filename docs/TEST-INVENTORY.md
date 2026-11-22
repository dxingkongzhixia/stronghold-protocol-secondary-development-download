# 测试清单（自动生成）

<!-- doc: role=reference status=reference -->
> `node tools/test-inventory.mjs` 生成；**不要手改**。`test/docs-facts.test.js` 与 `npm run docs:check` 会检查本页
> 是否过期（新增/拆分/改名一个测试文件后重新生成即可）。计数来自源码里的 `test(` / `it(`，是清单不是断言数量。

| 层 | 文件 | 用例（静态计数） |
|---|---:|---:|
| unit / integration | 902 | 8048 |
| fast | 17 | 162 |
| golden tests | 4 | 11 |
| browser (opt-in) | 101 | 326 |
| studio | 4 | 26 |
| native (opt-in) | 3 | 5 |
| **合计** | **1031** | **8578** |

## golden 语料文件

- `test/golden/bonds.json`
- `test/golden/diy.json`
- `test/golden/fields.json`
- `test/golden/matches.json`
- `test/golden/roster.json`
- `test/golden/standins.json`

## 浏览器 smoke（`npm run test:browser:smoke`，CI `browser-smoke` job）

- `test/ui/protocol-boot.e2e.test.js`
- `test/ui/hotkeys.e2e.test.js`
- `test/ui/settings-entry.e2e.test.js`
- `test/ui/screen-fit.e2e.test.js`
- `test/ui/title-surfaces.e2e.test.js`
- `test/ui/mock.e2e.test.js`

## 素材 e2e（`npm run test:e2e:assets`，opt-in）

- `test/ui/standin.e2e.test.js`
- `test/ui/spectator.e2e.test.js`
- `test/ui/teammate-loadout.e2e.test.js`
- `test/ui/leftovers.e2e.test.js`
- `test/ui/watch-bonds.e2e.test.js`

## native-room（`SP_NATIVE_E2E=1`，`npm run test:e2e:assets -- --native`）

- `test/ui/native-room-bench.e2e.test.js`
- `test/ui/native-room-fallback.e2e.test.js`
- `test/ui/native-room.e2e.test.js`
