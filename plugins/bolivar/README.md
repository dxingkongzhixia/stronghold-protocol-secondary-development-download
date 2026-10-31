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
content/patches.json      10 人（基础+精锐）追加盟约；8 名自造成员设为可见
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

## 名册

- **10 人**：跃跃、格雷伊、刻俄柏、谬因、承曦格雷伊、羽毛笔、龙舌兰、佩德洛、杜宾、米格鲁。
  - 3 人档、6 人档都可达。
  - 8 名自造成员（刻俄柏、谬因、承曦格雷伊、羽毛笔、龙舌兰、佩德洛、杜宾、米格鲁）在基础数据里属于
    隐藏的商店干员（各自阵营加强）；本插件把它们设为可见。
  - 基础与精锐两条都追加盟约；精锐上场的成员也计入。
- 谬因 = `char_4229_aphris`（**不是**缪尔赛思）。
- 刻俄柏 / 谬因复用官方自选 kit；其余 6 人暂走 generic kit。
- 这仍是插件盟约（`isCore: false`），不参与调和 / 核心 ban；原型阶段接受。

## 验证

```bash
node tools/keel.mjs check plugins/bolivar --strict
node tools/plugin.mjs check bolivar --strict
node --test test/content/bolivar.test.js
```

房间插件面板开启 `bolivar` 即可测试。
