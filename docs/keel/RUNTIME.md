# Keel 运行时

> 状态：**已接入实时对局**。原生 `sim` 在浏览器 Worker；`match` / `policy` 在服务端 match host meta；普通 content/asset 房间仍在页面内模拟。
> 代码：`shared/keel/runtime.js`、`state.js`、`commands.js`、`rng.js`、`budget.js`、`host.js`、`loader.js`；浏览器侧 `public/js/battle/simWorkerRuntime.js`、`simHost.js`；服务端侧 `server/match/host/`。
> 功能总览：[`FEATURES.md`](FEATURES.md)。

## 1. 它是什么

运行时把 manifest 3 的 `sim` / `match` / `policy` 模块跑起来：

```text
manifest 3
  → graph（模块/能力/顺序）
  → loadKeelModules（ESM default export）
  → createKeelRuntime
       ├─ 每个模块：state 切片 + command log + budget + capability API
       ├─ setup()
       ├─ sim.setup / sim.battleStart
       ├─ tick(dt) × N：host.tick + sim.tick
       └─ sim.battleEnd
  → snapshot / hash / errors
```

- `sim`：浏览器 Worker（`WorkerSimHost`），页面只收 `b.snap` / `b.ev`；执行前需要本浏览器确认。
- `match` / `policy`：服务端 match host child；浏览器不下载 meta 代码。
- `content` / `asset` / `ui` / `lang`：构建期或加载期；不经过 battle runtime。
- vanilla 房间不使用 Keel runtime，保持原行为。

## 2. 模块形状

```js
export default {
  setup({ api, state, manifest, host }) {
    api.state.patch({ kills: 0 });
  },
  hooks: {
    'sim.setup'(_ctx, api) { api.spawn({ id: 'ally', side: 'ally', hp: 10 }); },
    'sim.tick'(_ctx, api) {
      const [target] = api.units({ side: 'enemy', alive: true });
      if (target) api.damage({ target: target.id, amount: 10, type: 'true' });
    },
    'sim.battleEnd'(_ctx, api) { api.state.patch({ ended: true }); },
  },
};
```

- `setup` 只调用一次；
- `hooks` 的 key 是 [`CONTRACTS.md`](CONTRACTS.md) 的扩展点名；
- 一个模块可以只导出 `setup`，也可以只导出 hooks；
- 模块不能 import `server/**`、`public/**`；它只拿 `api`。

## 3. API（按能力发放）

| API | 需要的能力 | 说明 |
|---|---|---|
| `api.units(query)` | `sim.read` | 返回单位副本，按 id 排序（含 `bonds` / `defId` / `items` / `sp` / `blockCnt` / `rangeGrid`） |
| `api.damage(spec)` | `sim.damage.write` | `{ target, amount, type }` |
| `api.heal(spec)` | `sim.heal.write` | `{ target, amount }` |
| `api.buffs.has/list` | `sim.read` | 只读 |
| `api.buffs.apply/remove` | `sim.buff.write` | 写 |
| `api.bonds.get(id)` / `api.bonds.list()` | `sim.bond.read` | 盟约的 `{ layers, active, tier, count }`（只读副本） |
| `api.bonds.addLayers(id, n)` | `sim.bond.write` | 走 `Battle.addLayers`：`BOND_LAYER_CAP` 999 上限，`layerGains` 关闭时 no-op |
| `api.status.apply(target, key, opts)` / `api.status.remove(target, key)` | `sim.status.write` | 走 `Battle.applyStatus` / `removeBuff`；`STATUS[key]` 不存在时按同名 flag 处理，可做插件自定义状态 |
| `api.spawn(spec)` | `sim.spawn` | 敌人（默认）/ 己方 `token`（`kind: 'token'`）/ 装置（`kind: 'device'`） |
| `api.rng(name)` | `sim.rng` | 命名随机流；没有 `Math.random` |
| `api.fx(kind, at, data)` | `sim.fx` | 表现事件 |
| `api.command(cmd)` | `match.economy.write` | 进入 command log |
| `api.state.get/set/patch` | —（由 runtime 拥有） | 只能 JSON |
| `api.log(level, msg, data)` | — | 最多 1000 条 |

没有能力时，调用抛 `KEEL_DENIED`，**该模块本局被禁用**，不是整个房间崩。

## 4. 状态、命令、快照

- 每个模块一个 JSON state 切片；`get()` 返回副本，写走 `patch/set`。
- 所有对局写操作走 `api.command`，进入 command log（`seq/frame/command`）。
- `runtime.snapshot()`：

```json
{
  "manifest": { "id": "demo", "version": "1.0.0" },
  "frame": 60,
  "state": { "demo:sim:sim/index.js": { "version": 1, "value": { "ticks": 60 } } },
  "commands": { "demo:sim:sim/index.js": [] },
  "budgets": { "demo:sim:sim/index.js": { "hook": 0.01, "frame": 0.01, "match": 0.6 } },
  "disabled": []
}
```

- `restore(snapshot)` 恢复 state / commands / budgets / disabled；host 状态由 host 自己恢复。
- `hash()` 只覆盖 `state + commands + disabled`，用于确定性比较。

## 5. 预算

| 预算 | 默认 | 行为 |
|---|---|---|
| `perHook` | 0.2ms | 单次 hook 超过 → `KEEL_BUDGET`，模块禁用 |
| `perFrame` | 0.05ms | 一帧累计超过 → 同上 |
| `perMatch` | 100ms | 整局累计超过 → 同上 |

hook 成本是**估计值**（默认 0.01ms），不是实测；真实设备校准仍是可选项。

## 6. host 接口

`createFakeHost` 实现：

```ts
units(query) / damage(spec) / heal(spec) / buffs.{has,apply,remove,list}
bonds.{get,list,addLayers} / spawn(spec) / rng(stream) / fx(kind, at, data) / tick(dt) / frame / snapshot() / restore()
```

真实后端 `createStrongholdHost(battle)`（`server/keel/stronghold-host.js`）把同一组方法映射到 `Battle`：

| Keel | Battle |
|---|---|
| `units(query)` | `battle.units` → `unitView`（副本，不暴露 Unit） |
| `damage(spec)` | `battle.makeDamage` + `battle.dealDamage` |
| `heal(spec)` | `battle.heal` |
| `buffs.apply/remove/has/list` | `battle.addBuff` / `removeBuff` / `unit.buffs` |
| `bonds.get/list` | `battle.getPlayer(pid).bonds`（只读副本） |
| `bonds.addLayers` | `battle.addLayers(pid, bondId, n, 'keel')`（999 上限、`layerGains` 开关） |
| `status.apply/remove` | `battle.applyStatus` / `removeBuff`（任意 key；未知 key 走同名 flag） |
| `spawn(spec)` | `battle.spawnEnemy`（只支持敌人；token/device 尚未支持） |
| `rng(stream)` | `deriveSeed(battle.seed, "keel:<stream>")` + `server/sim/rng.js` |
| `fx(kind, at, data)` | `battle.fx` |
| `frame` | `round(battle.time * 30)` |

### 6.1 接到 Battle 的 hook bus

`attachKeel(battle, { manifest, modules })`（`server/keel/attach.js`）：

- 在 `battle.start()` 之前调用；
- 把 `battleStart / deploy / tick / beforeAttack / hit / damaged / heal / kill / death / enemySpawn / enemyLeak / blocked / battleEnd` 映射到 `sim.*`；
- 只把 **view** 交给插件：`unitView`、`dmg` 副本、`targets` 副本；
- 允许写回的字段只有 `dmg.amount/type/mul/tags/cancel`、`damaged.amount`（只能降低）、`heal.amount`、`beforeAttack.targets`；
- 返回 `{ runtime, host, detach, snapshot }`；`detach()` 用 `battle.offOwner(owner)` 清理。

```js
const handle = attachKeel(battle, { manifest, modules });
battle.start();
// ... battle runs; handle.runtime.snapshot() / .errors
handle.detach();
```

`newBattle` 只在提供 `keel` descriptor 时 attach；没有 descriptor 的房间不受影响。

### 6.2 房间接线

- `server/keel/room-source.js`：
  - `loadKeelPlugin(dir)`：读 `plugin.keel.json` 或 manifest 3 的 `plugin.json`；v2 文件夹返回 `null`；
  - `loadKeelRoom(dirs)` / `createKeelDescriptor(dirs)`：产出 `{ plugins: [{ id, manifest, modules }] }`。
- `Match({ keel })` 把它存到 `this.keel`；
- `newBattle` 在 `battle.start()` 前，按 `opts.keel ?? this.keel` 调用 `attachKeel`；`KEEL=0` 不 attach；
- `server/lobby.js` 已有 `room.keel` 的透传位；**还没有地方设置 `room.keel`**。

```js
// 目前的调用方式（测试 / 未来的 lobby）
const keel = await createKeelDescriptor([pluginDir]);
const match = new Match({ ...opts, keel });
```

### 6.3 `sp:sdk@1` 兼容 helper

`server/keel/v2-script.js` 把 v2 `setup(sp)` 脚本接到现有 extension registry：

```js
const loaded = await loadV2ScriptPlugin(dir, manifest);      // importScript 链接 sp:sdk@1
runV2Setup({ setup: loaded.setup, plugin: { id, permissions, overrides } });
```

- `runV2Setup` / `runV2Setups` 是 **pre-battle**：必须在 `new Battle` 之前调用，因为内容安装器在构造时读 registry；
- 它 `resetExtensions()` → `setup(sp)` → `sealExtensions()`，并返回注册表；
- 它不读取/放宽旧的 lock、pin、consent 门禁；
- 自动接线：`plugin.keel.json` 带 `"compat": { "v2Script": true }` + `legacy.entry`，`KEEL_V2=1` 时 `Match` 构造阶段执行 `runV2Setups`；v2 脚本仍走旧加载器的信任门禁；
- **registry 是进程全局的**：一个进程只应跑一组 v2 脚本；多组请用 match host 隔离。

`test/keel/v2-script.test.js` 用 `_template/script` 验证：kit 注册后 `EXTENSIONS` 和 `kitOf` 都能解析。

## 7. `keel run`

```bash
node tools/keel.mjs run test/fixtures/keel-demo --seed 1 --frames 60 --json
```

fixture 的 `sim` 模块每 10 帧打一次 30 点真实伤害，60 帧后：

- `ticks: 60`、`hits: 4`、`kills: 1`、`ended: true`；
- `errors: []`；
- `hash` 稳定。

内容插件没有可执行模块时输出 `no executable modules (content/asset/lang only)`。

## 8. 已知边界

- **已接进 `newBattle`**：`Match` 把房间的 Keel descriptor 交给 `newBattle`；原生 sim 在浏览器 Worker，`match`/`policy` 在服务端 meta。
- **不执行 native trust**：`trust: "native"` 的 Keel 插件被拒绝（`PLUGIN_KEEL_NATIVE`）；受信页面/服务端 runtime 已删除。
- **原生 sim 在浏览器 Worker 执行（D9）**：通过 `/cs` 的 `index.keel` 与 `keel/<id>/<entry>` 文件下发；含原生 sim 的房间为每个 field 创建一个 `WorkerSimHost`（`public/js/battle/simWorker.js`），引擎、content set 和原生模块都在 Worker 的 SES 里编译/运行，页面只收 `b.snap` / `b.ev` 包。主页面不做 lockdown、也不加 `'unsafe-eval'`。**执行前需要本浏览器的原生代码确认**（`ui/nativeConsent.js`，按 cs 记住；未确认不 ready、不执行）。Worker 的 `step` 有按步数放大的超时；失败会终止该 field 并交给服务器兜底。
- **同源 SES sandbox frame 已删除**（D9）：`public/keel-sandbox.html`、`keelSandboxFrame.js`、`keelMembrane.js`、`KEEL_SANDBOX_CSP` 都不再存在；原生模块只在模拟 Worker 里编译。
- **服务端不执行原生 sim**（D10）：`server/keel/room-source.js`、HTTP 进程和 room map 只读 manifest/lock/源码（`code:false`）；原生房间强制 `SP_VERIFY=off`。服务端自己跑的 field（bot / 接管 / boss 兜底）只用 content 数据，不跑 sim。
- **`match`/`policy` 只跑服务端 meta**（D11）：match host child 用 `loadKeelPlugin(dir, { code: 'meta' })`，`Match.keelMatch` 运行它们；浏览器只收 `sim` 模块，不下载 meta 代码。
- **bot / 接管 / 无人类 boss 的 sim**（D12）：含原生 sim 的房间把这些 field 委托给在线浏览器（房主优先）；`b.start.background` 只模拟并上报，不切换玩家视图；每个浏览器最多 8 个 field（含自己的），满了由服务器跑（只用 content 数据）。**房主断线 / 离开**时，房主的 field 也先委托给剩余真实玩家；没有真实玩家时才由服务器跑 / 房间销毁。
- **元数据不是 pin**：`name` / `description` / `authors` / `version` 由服务器的 `index.keel` 提供，是展示字段；`cs` pin 的是模块/内容字节（以及原生模块的 sha256），不是这些标签。改元数据不会改变代码哈希；需要“作者不可被服务器偷换”的信任模型时，应把 descriptor 也纳入 `cs` 或从已 pin 的 manifest 读取。当前明确按“服务器提供，哈希才是 pin”处理。
- **`sim.hit/damaged/heal/kill` 已能由 Battle 自动触发**（`attach.js`），但只对 Keel-native 模块；`compat.v2Script` 仍走自己的 `setup(sp)` 扩展注册表。
- **`spawn` 支持敌人 / 己方 token / 装置**：token 的 def 来自 `tokens` 记录（或 `def`），device 是 ally 侧单位（`spawnDevice`）；都需要 owner `PlayerState`（默认本场玩家）。
- **装备效果**：`unitView.items` 只给 id 列表；引擎自带 buff 仍由 `items/battle.js` 应用，`custom: true` 装备的效果由插件的 `sim` 模块实现（`sim.battleStart` 读 `api.units()` 即可）。
- **盟约状态按玩家**：`bonds.*` 读的是 `battle.players[0]`（或 `attachKeel(..., { playerId })` 指定的玩家）的盟约；房间级描述符在单人/自己棋盘的对局里就是本人。
- **ctx 写只做白名单回写**：`dmg` / `amount` / `targets` 之外不保证；没有逐字段拒绝。
- **预算不是实测**：见 §5。
- **没有 UI/资产运行时**：`ui` / `asset` 仍是 M0 的静态模块。

## 9. 下一步

1. 工作室模块表单继续深化（每种模块的专属字段、依赖图交互）；
2. 真实 4 座压测剩下的 host 主动离开 UI、无人类 boss 的浏览器结果验证；
3. `compat.v2Script` 的长期归属（继续保留或迁成原生 sim 模块）。
