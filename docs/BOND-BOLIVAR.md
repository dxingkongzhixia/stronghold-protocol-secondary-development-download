# 玻利瓦尔国家盟约（v0.3 / Keel N 系列）

> **状态：原型已实现（2026-11-01）。**
> 跑在 Keel N 系列原生插件 `plugins/bolivar` 上：manifest 3 + `content` + `asset` + `sim`。
> v0.1（2026-10-28）的「战功 / 核心 build-data」方案已被取代；v0.2 定下猎犬、追猎、渴血。
>
> 本文是设计提案，不是 `DESIGN.md` 的规范章节；定稿并验收后再并入规范文档。

---

## 0. 一句话

玻利瓦尔 = **猎犬与猎手**：3 人放出猎犬、标记猎物（追猎）；6 人让猎犬与成员在猎物身上**渴血**——
造成伤害回血，击杀猎物获得短期狂暴。

- 3 / 6 名成员，国家盟约；
- 机制主体：**追猎（标记 / 集火 / 转火）** + **渴血（吸血 / 击杀叠加）**；
- 猎犬使用本机客户端抽取的 **「猎犬proto」**（`enemy_2137_shsdgo`）模型。

---

## 1. 为什么是 Keel 插件

| 方案 | 说明 |
|---|---|
| 核心 build-data + `bonds/core.js` | 永久国家盟约的正统做法，但要动 `data/*.json`、golden、ban/bot |
| **Keel 原生插件（本版）** | `content` 写盟约/成员/图标，`sim` 写追猎/渴血；房间开启即可测试，不动数据与 golden |
| 内置插件（后续） | 原型验证后，再决定是否做成默认/内置；避免过早锁死 |

Keel 已具备本设计需要的全部能力：

- `bond_x_*` 记录 + `chess.bonds` 成员；
- `sim` hooks：`battleStart / beforeAttack / hit / kill / tick`；
- `api.units`（含 `bonds` / `items` / `rangeGrid`）；
- `api.spawn` 生成**己方 token**（猎犬）；
- `api.buffs` / `api.heal` / `api.status`；
- 模块 `state`（标记、层数）与确定性 RNG。

> **不要用 `api.bonds.addLayers` 当战功/追猎计数**：层数是跨回合持久资源，战后还会被
> `fields.js` 按策略允许量校验。追猎/渴血用模块 `state`，只在本场生效。

---

## 2. 成员（2026-11-01 暂定）

按业主给的「本」（等阶 / tier）列表，共 **10 人**：

| 干员 | charId | 本（tier） | 星级 | 职业 · 子职业 | 当前 chess | 素材 | kit |
|---|---|---|---|---|---|---|---|
| 刻俄柏 | `char_2013_cerber` | 6 | 6★ | 术师 · 中坚术师 | 无 | 有（立绘/Spine） | `op-cerber` |
| 缪尔赛思（缪因） | `char_249_mlyss` | 6 | 6★ | 先锋 · 战术家 | `chess_char_6_11_a` | 有 | `chess_char_6_11` |
| 承曦格雷伊 | `char_1027_greyy2` | 5 | 5★ | 狙击 · 投掷手 | 无 | 需抽取 | 需写 |
| 羽毛笔 | `char_421_crow` | 4 | 5★ | 近卫 · 收割者 | 无 | 需抽取 | 需写 |
| 龙舌兰 | `char_486_takila` | 4 | 5★ | 近卫 · 解放者 | 无 | 需抽取 | 需写 |
| 佩德洛 | `char_4234_pedro` | 3 | 5★ | 辅助 · `supportiveranger` | 无 | 需抽取 | 需写 |
| 杜宾 | `char_130_doberm` | 3 | 4★ | 近卫 · 教官 | 无 | 需抽取 | 需写 |
| 米格鲁 | `char_122_beagle` | 2 | 3★ | 重装 · 铁卫 | 无 | 需抽取 | 需写 |
| 格雷伊 | `char_253_greyy` | 1 | 4★ | 术师 · 扩散术师 | `chess_char_1_14_a` | 有 | `chess_char_1_14` |
| 跃跃 | `char_4100_caper` | 1 | 4★ | 狙击 · 回环射手 | `chess_char_1_09_a` | 有 | `chess_char_1_09` |

> 露托 / 特克诺 / 聆音 不在本次暂定名单。
> 计数仍看棋子的 `bonds` 是否含 `bond_x_bolivar_pack`，不读 `nationId`。
> 缪尔赛思仍保留调和；承曦格雷伊与格雷伊是两个 chess，各算一人。

### 2.1 落地状态

| 状态 | 干员 | 说明 |
|---|---|---|
| 已在棋子里 + 已有素材/kit | 跃跃、格雷伊、缪尔赛思 | 插件已 patch（3 人） |
| 有素材/kit/backup，可直接加 | 刻俄柏 | `op-cerber` + 立绘/Spine；下一步加为第 4 人 |
| 需先抽取素材 + 补 kit | 承曦格雷伊、羽毛笔、龙舌兰、佩德洛、杜宾、米格鲁 | 6 人；补齐后才能实测 6 人档 |

### 2.2 原型阶段

- **当前插件**：跃跃 + 格雷伊 + 缪尔赛思（3 人，激活 3 人档）。
- **P1.5**：加刻俄柏 → 4 人。
- **P2**：补 2 名以上（承曦格雷伊 / 羽毛笔 / 龙舌兰 / 佩德洛 / 杜宾 / 米格鲁）→ 6 人档可达。

---

## 3. 机制：追猎 + 渴血

### 3.1 3 人档：追猎

- 战斗开始时，在队伍附近召唤 **1 只猎犬**（`token_x_bolivar_hound`，Spine 为「猎犬proto」
  `enemy_2137_shsdgo`，已实现）。
- 玻利瓦尔干员 / 猎犬攻击敌人时，给目标施加 **「猎物」6 秒**（可刷新）。
- 对「猎物」造成的伤害 **+15%**（干员与猎犬都吃）。
- 「猎物」死亡时，标记**转移到最近的敌人**，持续 6 秒——猎犬继续追。
- 猎犬的 `beforeAttack` 优先选择被标记的猎物（在射程内时）。

### 3.2 6 人档：渴血

- 再召唤 **1 只猎犬**（共 2 只）。
- 玻利瓦尔干员 / 猎犬对「猎物」造成伤害时，回复 **8% 伤害的生命**。
- 击杀「猎物」获得 **「渴血」5 秒**：攻击速度 **+20**、攻击力 **+10%**，最多 **3 层**。
- 猎犬死亡后 **12 秒**在队伍附近重新召唤（每场最多 2 次），保持「狗主导」。

### 3.3 数值（`bb`，原型值）

| 项 | `bb` 字段 | 3 人 | 6 人 |
|---|---|---|---|
| 猎物持续时间 | `mark_duration` | 6 s | 6 s |
| 对猎物增伤 | `mark_damage_scale` | 0.15 | 0.15 |
| 猎犬数量 | `hound_count` | 1 | 2 |
| 猎犬攻击/生命倍率 | `hound_atk_scale` / `hound_hp_scale` | 1.0 / 1.0 | 1.0 / 1.0 |
| 对猎物吸血 | `lifesteal_scale` | — | 0.08 |
| 渴血持续 / 攻速 / 攻击 | `blood_duration` / `blood_aspd` / `blood_atk` | — | 5 s / +20 / +10% |
| 渴血叠加上限 | `blood_max_stacks` | — | 3 |
| 猎犬重生 | `hound_respawn` / `hound_respawn_max` | — | 12 s / 2 次 |

原型先按这套数值跑；实战后再调。

---

## 4. Keel 实现

### 4.1 插件结构

```text
plugins/bolivar/                  # Keel 原型（已实现）
├─ plugin.json                    # manifest 3
├─ plugin.lock.json               # pack 生成的 Spine 动画 / 文件哈希
├─ content/bonds.json             # bond_x_bolivar_pack
├─ content/patches.json           # 把 bond 追加到 3 条棋子
├─ content/tokens.json            # token_x_bolivar_hound
├─ sim/index.js                   # 追猎 / 渴血
└─ assets/
   ├─ icon.png                    # 盟约图标（logo_bolivar）
   └─ hound/                      # 猎犬proto（enemy_2137_shsdgo）Spine
```

- `id: bolivar`；bond id `bond_x_bolivar_pack`（命名空间 `bolivar`）。
- `isCore: false`（插件 bond，不参与调和 / 核心 ban；原型阶段接受）。
- 猎犬素材从本机 B 站鹰角客户端抽取：
  `enemy_2137_shsdgo`（猎犬proto），已放入 `assets/hound/`。

### 4.2 sim 状态与 hooks

```text
state: {
  marks: { [enemyId]: expiryFrame },   // 猎物
  hounds: [unitId],
  blood: { [unitId]: { stacks, expiry } },
  respawns: number
}
```

| hook | 做什么 |
|---|---|
| `sim.battleStart` | 找 `bonds` 含 `bond_x_bolivar_pack` 的成员；召唤猎犬；初始化 state |
| `sim.beforeAttack` | 成员/猎犬攻击 → 标记目标；猎犬优先把 `targets` 指向猎物 |
| `sim.hit` | 来源是成员/猎犬且目标是猎物 → `dmg.amount *= 1.15` |
| `sim.kill` | 猎物死亡 → 标记转移；6 人档回血 + 渴血 buff |
| `sim.tick` | 过期标记清理；猎犬重生计时 |
| `sim.battleEnd` | 清理（可选） |

> 猎犬是 `token_x_bolivar_hound`（Spine 来自 `enemy_2137_shsdgo`），由 `api.spawn` 生成；
> 3 人 1 只、6 人 2 只，死亡 12 秒后重生（每场最多 2 次）。

### 4.3 核心小改动

- `unitView` 增加 **`bonds`**（成员判定）与 **`defId`**（调试/日志）；服务端与浏览器 host 已同步。
- 这是 Keel 的只读视图扩展，不改变战斗规则。

---

## 5. 分期

| 阶段 | 内容 | 状态 |
|---|---|---|
| **P1 原型** | Keel 插件 + 3 成员 + 追猎（1 猎犬/标记/增伤）+ 6 人档代码骨架 | **已完成（2026-11-01）** |
| **P2 六人档** | 补 3 名成员（露托/羽毛笔/龙舌兰等，按素材/kit 成本）+ 吸血 + 2 猎犬 | 待做（代码已写，名单不足） |
| **P3 调优** | 实战数值、图标、i18n、是否内置化 | 待做 |

---

## 6. 已确认 / 仍待定

1. **猎犬模型**：已确认使用「猎犬proto」（`enemy_2137_shsdgo`），不借用狼群 token。
2. **放狗时机**：已确认 3 人 1 只、6 人 2 只。
3. **缪尔赛思**：原型先纳入（3 人档需要她凑数）；是否长期保留见 P2 平衡。
4. 6 人档的「精英/领袖」判定：`victim.isBoss` + 精英 tag，还是按 tier？（目前代码用猎物标记，未单独判定精英）
5. 是否把插件提升为内置 / 默认开启。

## 7. 验证

```bash
node tools/keel.mjs check plugins/bolivar --strict
node tools/plugin.mjs check bolivar --strict
node --test test/content/bolivar.test.js
```

- `test/content/bolivar.test.js`：3 条用例（内容集 / 3 人 1 猎犬与 +15% / 6 人 2 猎犬、吸血、渴血）。
- 原型名单 3 人，6 人档逻辑已写但不可达；补齐成员后再做真实房间验证。
