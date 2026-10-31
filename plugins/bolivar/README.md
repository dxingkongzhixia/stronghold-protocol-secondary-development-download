# bolivar（玻利瓦尔：猎犬）

玻利瓦尔国家盟约的 **Keel N 系列原型**：以猎犬为主导，机制主体是 **追猎 + 渴血**。

## 机制

- **3 人（追猎）**：召唤 1 只猎犬；玻利瓦尔干员 / 猎犬攻击敌人时施加「猎物」6 秒；
  对猎物造成的伤害 +15%；猎物死亡时标记转移到最近的敌人。
- **6 人（渴血）**：召唤第 2 只猎犬；对猎物造成伤害时回复 8% 伤害的生命；
  击杀猎物获得「渴血」5 秒（+20 攻速 / +10% 攻击，最多 3 层）。
- 猎犬死亡 12 秒后在队伍附近重生，每场最多 2 次。

## 文件

```text
plugin.json               manifest 3（content + asset + sim）
content/bonds.json        bond_x_bolivar_pack
content/patches.json      把 bond 追加到跃跃 / 格雷伊 / 缪尔赛思
content/tokens.json       token_x_bolivar_hound
sim/index.js              追猎 / 渴血
assets/hound/             猎犬proto（enemy_2137_shsdgo）的 Spine
assets/icon.png           盟约图标（玻利瓦尔 logo）
```

## 猎犬素材

从本机 B 站鹰角客户端（`Arknights bilibili`）抽取的 **「猎犬proto」**（`enemy_2137_shsdgo`）：

```python
# tools/local-extract/extract.py 的 export_enemy_spines 支持指定 ids
import sys
from pathlib import Path
sys.path.insert(0, "tools/local-extract")
import extract
AB = Path(r"<...>/games/Arknights/Arknights_Data/StreamingAssets/AB/Windows")
extract.export_enemy_spines(AB, Path("<out>"), {}, print, ["enemy_2137_shsdgo"])
```

输出为 `spine/enemy/enemy_2137_shsdgo/{skel,atlas,png}`；已放进 `assets/hound/`。
`plugin.lock.json` 由 `tools/plugin.mjs pack` 写入动画数据。

## 原型范围

- 成员：跃跃、格雷伊、缪尔赛思（3 人，刚好激活 3 人档）。
- 6 人档代码已写，但当前名单不可达；补齐 6 名成员后再验证。
- 这是插件盟约（`isCore: false`），不参与调和 / 核心 ban；原型阶段接受。

## 验证

```bash
node tools/keel.mjs check plugins/bolivar --strict
node tools/plugin.mjs check bolivar --strict
node --test test/content/bolivar.test.js
```

房间插件面板开启 `bolivar` 即可测试。
