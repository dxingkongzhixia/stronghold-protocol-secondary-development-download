# 玻利瓦尔国家盟约（v0.2 / Keel N 系列）

> **状态：草案 v0.2（2026-10-31），未实现。**
> v0.1（2026-10-28）的「战功 / 核心 build-data」方案已被本版取代：**改用 Keel N 系列原生插件**
> （manifest 3 + `content` + `sim`），主题改为**猎犬主导的「追猎 + 渴血」**。
>
> 本文是设计提案，不是 `DESIGN.md` 的规范章节；定稿并验收后再并入规范文档。

---

## 0. 一句话

玻利瓦尔 = **猎犬与猎手**：3 人放出猎犬、标记猎物（追猎）；6 人让猎犬与成员在猎物身上**渴血**——
造成伤害回血，击杀猎物获得短期狂暴。

- 3 / 6 名成员，国家盟约；
- 机制主体：**追猎（标记 / 集火 / 转火）** + **渴血（吸血 / 击杀叠加）**；
- 以 **Keel 原生插件**开发，先原型、后内置化。

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

## 2. 成员

### 2.1 官方 `nationId=bolivar`（8）

| 干员 | charId | 星级 | 职业 · 子职业 | 当前 chess | 素材 |
|---|---|---|---|---|---|
| 跃跃 | `char_4100_caper` | 4★ | 狙击 · 回环射手 | `chess_char_1_09_a` | 有 |
| 格雷伊 | `char_253_greyy` | 4★ | 术师 · 扩散术师 | `chess_char_1_14_a` | 有 |
| 露托 | `char_4130_luton` | 4★ | 重装 · 不屈者 | 无 | 需抽取 |
| 羽毛笔 | `char_421_crow` | 5★ | 近卫 · 收割者 | 无 | 需抽取 |
| 龙舌兰 | `char_486_takila` | 5★ | 近卫 · 解放者 | 无 | 需抽取 |
| 特克诺 | `char_4164_tecno` | 5★ | 术师 · `soulcaster` | 无 | 需抽取 |
| 聆音 | `char_4187_graceb` | 5★ | 近卫 · 本源近卫 | 无 | 需抽取 |
| 佩德洛 | `char_4234_pedro` | 5★ | 辅助 · `supportiveranger` | 无 | 需抽取 |

### 2.2 按出身纳入（待确认）

| 干员 | charId | 官方 `nationId` | 星级 | 当前 chess |
|---|---|---|---|---|
| 刻俄柏 | `char_2013_cerber` | rhodes | 6★ | 无 |
| 缪尔赛思 | `char_249_mlyss` | columbia | 6★ | `chess_char_6_11_a` |
| 承曦格雷伊 | `char_1027_greyy2` | rhodes | 5★ | 无 |
| 杜宾 | `char_130_doberm` | rhodes | 4★ | 无 |
| 米格鲁 | `char_122_beagle` | rhodes | 3★ | 无 |

### 2.3 原型名单（P1）

**跃跃 + 格雷伊 + 缪尔赛思**（3 人，刚好激活 3 人档）。用 content patch 把
`bond_x_bolivar_pack` 追加到这三条棋子的 `bonds`，不改 `nationId`。

- 6 人档需要再加 3 名成员；原型阶段机制先写，但不可达。
- 缪尔赛思仍保留调和；是否纳入见 §7。

---

## 3. 机制：追猎 + 渴血

### 3.1 3 人档：追猎

- 战斗开始时，在队伍附近召唤 **1 只猎犬**（`token_10028_vigil_wolf`，官方「狼群」；
  也可换成自定义猎犬 token）。
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
plugins/bolivar/                  # 原型（本地；验证后再决定内置/提交）
├─ plugin.json                    # manifest 3
├─ content/bonds.json             # bond_x_bolivar_pack
├─ content/patches.json           # 把 bond 追加到 3 条棋子
├─ sim/index.js                   # 追猎 / 渴血
└─ assets/icon.png                # 盟约图标（可选）
```

- `id: bolivar`；bond id `bond_x_bolivar_pack`（命名空间 `bolivar`）。
- `isCore: false`（插件 bond，不参与调和 / 核心 ban；原型阶段接受）。
- 图标可用 `logo_bolivar` 的副本；没有则回退占位。

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

### 4.3 需要的核心小改动

- `unitView` 增加 **`bonds`**（成员判定）与 **`defId`**（调试/日志）；服务端与浏览器 host 同步。
- 这是 Keel 的只读视图扩展，不改变战斗规则。

---

## 5. 分期

| 阶段 | 内容 | 预估 |
|---|---|---|
| **P1 原型** | Keel 插件 + 3 成员 + 追猎（1 猎犬/标记/增伤）+ 6 人档代码骨架 | 1 天 |
| **P2 六人档** | 补 3 名成员（露托/羽毛笔/龙舌兰等，按素材/kit 成本）+ 渴血 + 2 猎犬 | 2–3 天 + 素材 |
| **P3 调优** | 实战数值、图标、i18n、是否内置化 | 2–3 天 |

---

## 6. 待确认

1. **猎犬用官方「狼群」`token_10028_vigil_wolf`，还是自定义猎犬 token + 素材？**
2. 3 人档是否就要 1 只猎犬？还是 3 人只标记、6 人才放狗？
3. 缪尔赛思是否纳入（6★ 双国籍，强度偏高）。
4. 6 人档的「精英/领袖」判定：`victim.isBoss` + 精英 tag，还是按 tier？
5. 插件原型先本地（`plugins/bolivar`），还是直接做内置插件？

## 7. 验证

```bash
node tools/keel.mjs check plugins/bolivar --strict
node tools/keel.mjs run plugins/bolivar --frames 60 --json
```

战斗侧：用 `test/helpers/battleHarness.js` 构造一场带 3 名成员的战斗，断言
标记、增伤、猎犬生成、6 人档回血/渴血；再进真实房间验证图鉴、激活与 UI。
