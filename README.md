# 卫戍协议：盟约 · Stronghold Protocol: Alliance

![version](https://img.shields.io/badge/version-0.4.0-2ea44f)
![license](https://img.shields.io/badge/code%20license-GPL--3.0--or--later-blue)
![node](https://img.shields.io/badge/node-22%20%7C%2024-339933)

## 一句话（TL;DR）

- **这是什么**：明日方舟「卫戍协议」的非官方同人**网页复刻**，1–4 人合作，浏览器里玩。
- **在哪儿**：这里是二次开发版**主仓库**（GitHub），另有 **Gitee 国内镜像**；**我们是基于主线开发的分支项目**，不是主线项目本身。
- **怎么跑**：装 Node 22/24 → `npm install` → `node server/index.js` → 打开 `http://localhost:3000`。
- **第一次接手**：先读 [`docs/HANDOVER.md`](docs/HANDOVER.md)；按问题查文档用 [`docs/QUERY-INDEX.md`](docs/QUERY-INDEX.md)。

English one-liner: the **primary repository** (GitHub) of our independently maintained secondary-development build of the browser co-op fan mode *Stronghold Protocol: Alliance*, with a **Gitee mirror for downloads from mainland China**. This is **not the mainline project** — we are a **branch project** forked from the mainline [`sganggs/Stronghold-Protocol`](https://github.com/sganggs/Stronghold-Protocol), which is credited as the original source.

## 目录

- [一、这是什么仓库](#一这是什么仓库)
- [二、仓库里有什么](#二仓库里有什么)（含 [玩法一览](#玩法一览我们这一版)）
- [三、快速开始](#三快速开始)
- [四、相对主线的差异](#四相对主线的差异)
- [五、更新怎么发布](#五更新怎么发布)
- [六、文档](#六文档)
- [七、目录结构](#七目录结构)
- [八、致谢与许可](#八致谢与许可)
- [English](#english)

> **第一次接手本仓库？** 先读 [`docs/HANDOVER.md`](docs/HANDOVER.md)——接手入口：仓库地图、本地运行、构建 / 测试、内容制作、主线合并、发布与部署、已知坑。
> 想按主题直接跳到某份文档，用 [`docs/QUERY-INDEX.md`](docs/QUERY-INDEX.md)。

## 一、这是什么仓库

- **主仓库 / 国内镜像**：**GitHub 仓库**（`dxingkongzhixia/stronghold-protocol-secondary-development-download`）是我们二次开发版的**主仓库与分发入口**；国内访问慢时改用 **Gitee 镜像**（`marseille1/stronghold-protocol-secondary-development-download`）。想直接玩、想部署到自己机器上的博士，从这里克隆或下载即可。
- **分支项目（基于主线开发）**：**主线项目**是 `sganggs/Stronghold-Protocol`（代码基线、美术与数据来源都在那里）；本仓库在主线之上**独立维护**了一套改动：账号 / 野排匹配 / 公开同盟 / 观战与夺舍 AI、启动体验与带宽治理、**8 名自造干员**，以及一批规则修复与决策（见 [四、相对主线的差异](#四相对主线的差异) 与 [`docs/MATCHMAKING.md`](docs/MATCHMAKING.md)）。
- **不是主线**：主线的介绍、版本与发行包以**主线仓库**为准；本仓库只描述**我们这一版**。主线会**定期合并**进来（见 §四末），但我们的改动一直保留。
- **素材随仓库分发**：`public/assets`、`public/fonts`、`public/vendor` 在本仓库里被**跟踪**（约 590 MB），所以克隆下来**不需要再拉素材**就能运行。这些素材版权归鹰角网络 / Yostar，属社区便利分发，见 [八、致谢与许可](#八致谢与许可)。

> [!IMPORTANT]
> - 本项目是玩家自制的**非官方同人作品**，与上海鹰角网络科技有限公司（Hypergryph）、Yostar 及其关联方**没有任何关系**，未获其授权或认可。
> - 《明日方舟》及「卫戍协议」相关的名称、角色、美术、音乐、音效、文本与数据等素材，版权归原权利人所有，**不适用**本项目的 GPL-3.0 许可证；GPL 只覆盖本项目自己编写的代码。
> - 仅供学习交流与个人非商业使用，**严禁任何形式的盈利**。本仓库把运行时素材一并公开分发，是**维护者（owner）本人的决定**，目的是方便社区下载；权利人如认为不妥，请通过 Issue 联系，我们会**立即删除**相关内容。
> - 本项目按「现状」提供，**不提供任何担保**，使用风险自负。完整条款见 [NOTICE.md](NOTICE.md)。

## 二、仓库里有什么

这是一个**完整可运行**的项目，不只是补丁：

- **运行时素材**：`public/assets`（约 570 MB / 9500+ 个文件）、`public/fonts`、`public/vendor` —— 已被 git **跟踪**，克隆即得，无需再跑素材下载。
- **游戏数据**：`data/` —— 由官方数据表**生成**的 `data/*.json`（干员、敌人、地图、装备、盟约、策略、机变、素材清单等），连同生成脚本一起提交，可离线重建。
- **服务器与客户端**：`server/`（Node HTTP + WebSocket + 大厅 + 对局引擎 + **战斗模拟器**）、`public/`（浏览器客户端，原生 ES 模块）、`shared/`（前后端共用常量与线协议）。
- **测试与文档**：`test/`（`node:test`，完整一套）、`docs/`（设计、玩法、部署、调研与我们的决策记录）。
- **工具与脚本**：`tools/`（数据构建、素材、golden、打包）、`scripts/`（各平台启动脚本）。

服务器只负责大厅、经济与回合；**战斗在各玩家的浏览器里用同一份确定性模拟器运行**，一台低功耗小主机就能开服。

### 玩法一览（我们这一版）

- **完整的一局**：确认本局信息 → 策略轮选（40 名策略）→ 14 回合 → 结算称号；险境及以上满足条件时进入第 15 回合「隐秘核心」。
- **4 种难度**：标准 / 险境 / 绝境 / 终极；**独立模拟**（单人）与**同盟模拟**（1–4 人**合作**，空位可加 AI）。
- **休整期**：招募、刷新、冻结、升级调度中心；从整备区拖到棋盘部署，用**方向轮盘**选择朝向。
- **补位与自选编队**：自己没有的干员可由官方补位干员上场；5 / 6 阶各选 2 名自选 6★ 干员，技能与模组按官方实现。
- **盟约与层数**：势力核心 + 附加盟约，层数整局保留（上限 999 层）；装备、法术、机变选卡、晋升精锐。
- **自动作战**：技能按官方「技能策略」自动释放；元素损伤与爆发；**召唤物**由玩家手动摆放；推开 / 拉拽按力度与重量计算。
- **画面与声音**：真实 Spine 小人、官方 BGM 与音效、表情、作战特效、可选官方 3D 棋盘；多语言界面（中文 / English / 日本語 / 한국어 / 繁體中文）。

## 三、快速开始

### 前置

- **Node.js 22 或 24（LTS）** —— `package.json` 的 `engines` 要求 `node >= 22`。Windows 可 `winget install OpenJS.NodeJS.LTS`，或到 Node 官网下载。
- 磁盘：本仓库跟踪了运行时素材，克隆下来约 **600 MB 以上**（另加 `node_modules`）。

### 从克隆运行

```bash
git clone https://github.com/dxingkongzhixia/stronghold-protocol-secondary-development-download.git
cd stronghold-protocol-secondary-development-download

# 国内访问慢时改用 Gitee 镜像：
# git clone https://gitee.com/marseille1/stronghold-protocol-secondary-development-download.git

npm install            # 安装依赖（postinstall 会把 pixi / preact / three 复制到 public/vendor）
# 数据已随仓库提交；只有在需要时（例如改了生成脚本）才重建：
# node tools/build-data.mjs --offline     # 用已缓存的官方数据表确定性地重建 data/*.json

node server/index.js   # 启动服务器：http://localhost:3000
```

也可以使用启动脚本：Windows `scripts\start-windows.bat`，macOS / Linux `./scripts/start.sh`。浏览器会自动打开 `http://localhost:3000`，窗口里列出的局域网地址可直接发给同一网络的朋友。

- **换端口 / 绑定**：`PORT`（默认 `3000`）、`HOST`（默认 `::`，一个双栈 socket 同时服务 IPv6 与 IPv4）环境变量，或启动脚本加 `--port`。健康检查：`GET /healthz`。
- **管理页**：`http://localhost:3000/admin?token=<var/admin-token.txt>`。令牌在服务器的 `var/admin-token.txt`（启动日志里也会打印），**只在本机保存，不写进仓库**。
- **战斗模式**：`SP_COMBAT=client`（默认，浏览器模拟）或 `server`；`SP_VERIFY=off|sample|all` 控制服务器是否复算客户端结果。

### 测试

```bash
node --test            # 完整测试套件（约 6349 项；缺素材 / 浏览器的用例会自动跳过）
npm run golden         # 黄金结果：固定种子的整套战斗与人机对局摘要（改动玩法后按规则更新）
```

浏览器 / E2E 套件由环境变量控制（默认关闭）：`SP_E2E=1`（mock 浏览器）、`SP_REAL_E2E=1`（需已下载素材）、`RENDER_E2E=1`（需本机 Chrome）。

> **本地客户端素材（可选）**：官方 3D 棋盘、部分界面图标、若干敌人与召唤物的官方模型需要从本机的《明日方舟》客户端提取；没有客户端时游戏照常运行，这几样换成替代样式（2D 棋盘、样式相近的图标、染色的普通源石虫、召唤物头像）。表情和「玩法说明」的教程图随上面的素材一起从公开镜像下载，不需要客户端。没有客户端的服务器可以从**同一版本**的整合包（`npm run package` 生成）里复制 `public/assets/local/` 与 `data/local-assets.json`。详见 [`docs/DEPLOY.md`](docs/DEPLOY.md) 与 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) §9。

### 和朋友一起玩（局域网）

1. 打开页面 → 输入昵称 → **同盟模拟** → 创建房间；房主选难度，可添加 / 移除 AI 队友。
2. 把 4 位字母的**同盟密钥**或「复制链接」得到的 `http://<地址>:3000/?room=密钥` 发给朋友。
3. 所有人点「准备就绪」后房主开始。
4. 同一 Wi-Fi 下的朋友打开启动窗口里列出的地址即可；打不开多半是防火墙或访客 Wi-Fi 的「AP 隔离」。

刷新或断线后，**同盟模拟 10 分钟内**、**独立模拟 24 小时**内重新打开即可回到原座位。房间与对局都在内存里，**重启服务器会结束所有对局**。跨局域网联机（组网 / 隧道 / VPS）见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

### 操作要点（我们保留了这些交互）

- 购买 / 升级调度中心 / **机变选卡**：点一次选中，再点一次确认（`D` 升级）。
- 部署 / 移动干员：从整备区拖到棋盘格 → 出现方向轮盘 → 滑动选择朝向；点选、拖放和配发装备都**按地上的方格**。
- 装备：拖到干员所在格（每人 2 件）；**已配发的装备锁定在干员身上**（干员出售或合成精锐时退回整备区）。
- **暂停（独立模拟）**：作战中点顶栏的「暂停」或按 `Space`，再点「继续作战」；同盟模拟的作战不能暂停。
- **漏怪时顶栏用红字 + 「−N」标记待扣的目标生命值**（结算时才显示扣除后的数值）。
- 快捷键：`R` 刷新 · `F` 冻结 · `D` 升级 · `Q` 撤退 / `X` 出售 · `Space` 准备就绪 · `Esc` 取消；除 `Esc` 外均可在「设置 → 快捷键」改键。

完整规则见 [`docs/PLAYING.md`](docs/PLAYING.md)。

## 四、相对主线的差异

下面是**我们这一版自己加的东西**，都保留、不会因为合并主线而丢掉。

### 8 名自造干员

由 `tools/build-data.mjs` 的 `CUSTOM_CHESS` 注入；每名都有数据、`server/sim/content/kits/ops/` 下的 kit、美术与（多数）语音，并记录在 [`docs/MATCHMAKING.md`](docs/MATCHMAKING.md)。完整配方见 [`docs/NEW-OPERATOR.md`](docs/NEW-OPERATOR.md)，合并自检见 [`docs/OUR-FEATURES.md`](docs/OUR-FEATURES.md) §1。

| 干员 | 阶 | 盟约 | 一句话（依据） |
|---|---|---|---|
| **阿斯卡纶** | 3 | 灵巧 + 助力 | 伏击客：范围群攻 + 50% 物法闪避 + 嘲讽 −1；特质「助力、灵巧每 3 层 +1% 防御」（§23） |
| **结城理** | 3 | 拉特兰 + 不屈 | 傀儡师「双替身」：切换替身与倒地都叠层，S3 两个替身各自映射骨架剪辑，两个都被击倒才算倒下（§24 / §29 / §35.3） |
| **予愿安洁莉娜** | 3 | 叙拉古 + 迅捷 + 灵巧 | 巡空者「起飞」；范围内缚地 / 浮空 / 恐惧每 3 名叠层，每 8 发子弹再叠（§25） |
| **望** | 6 | 炎 + 奥术 + 协防干员 | 陷阱师全新棋子机制：连线激活、跟子、第二天赋直线增伤与法穿、S3 范围扩大 + 弹药（§30 / §35.2） |
| **澄闪** | 3 | 维多利亚 + 精准 + 助力 | 驭械术师：浮游单元全部锁定**同一敌人**、每个各打满攻击力；特质「购买价格为 1」（§31 / §35.2） |
| **娜仁图亚** | 3 | 萨尔贡 + 精准 + 迅捷 | 回环射手：回旋投射物必须回收才能再攻击，S3「吞日」三发齐射后在回收时爆发（§32） |
| **凯尔希·思衡托** | 4 | 调和 + 灵巧 + 协防干员 | 守望者：普通攻击即单体治疗、还能起飞；特质「获得时随机获取 2 件装备」；已**移出自选池**只作商店棋子（§34 / §35.1 / §35.7） |
| **克莱门莎** | 6 | 阿戈尔 + 不屈 + 协防干员 | 本源近卫「primguard」：阻挡 2、近战物理、可且优先攻击自身阻挡的单位；S1 冲蚀 / S2 风暴眼 / S3 与海为敌 + 两天赋；引擎为此加了放逐 / 传送、漩涡与强制缴械（§37） |

### 我们携带的修复与决策

- **驭械术师 / 浮游单元「集火」模型**（澄闪）：齐射锁定同一目标、各打满额攻击力；并修正了数据默认弹道盖掉浮游炮的问题（§35.2）。
- **联防使用本回合的完整竞技场**：撤销上游「逃逸地图」改动，联军在**本回合玩家作战的那张完整地图**上打，逃逸模板只提供波次与路线（§35.4）。
- **离开座位 → AI 接管 / 房间销毁**：对局中一名真人离开而房里还有人时，把这个座位交给**一个全新 AI**（比赛继续）；**所有真人都离开**才解散房间。显式离开立即交接，短暂掉线仍走重连宽限，宽限过期才交给 AI（§35.5）。
- **更新先推通知的工作流**：每次更新 / 重启前先在管理页 `/admin` 的「通知」面板推送一条告示（署名 `d星空之下`），玩家刷新页面即拿到新版（§28）。
- **其余规则修复**：命中率降低、缚地（`grounded`）、余音反伤脉冲重入、精锐合成落位、守望者治疗核实等，见 [`docs/MATCHMAKING.md`](docs/MATCHMAKING.md) §23–§35。

### 与主线的关系

我们会**定期合并主线** [`sganggs/Stronghold-Protocol`](https://github.com/sganggs/Stronghold-Protocol)：已经合并到主线 `feedback5` / **v0.2.0**（含 i18n 与一批规则修正，见 §33），合并时逐块解冲突、**保住我们的全部自定义内容**（合并黑名单与纪律见 [`docs/MATCHMAKING.md`](docs/MATCHMAKING.md) §22 与 [`docs/AI-WORKFLOW.md`](docs/AI-WORKFLOW.md)）。

## 五、更新怎么发布

我们的工作流是「**git 仓库存档（唯一真相）→ 推 GitHub 主仓库 + Gitee 镜像 → 回镜像工作树**」：

```bash
node tools/push-assets-relay.mjs              # ① 先把资源部署到中转机（123.57.150.185，客户端第一来源；推即部署）
node tools/push-gitee.mjs -m "本次改了什么"   # 提交已暂存的改动、推送 git 仓库到所有已配置的远程（GitHub 主仓库 → Gitee 镜像），再回镜像工作树
```

- git 仓库（`_merge-scratch`，分支 `ours`）是**唯一真相**；工作项目没有 `.git`，是它的镜像。脚本**只单向** store → 远程（GitHub 主仓库 / Gitee 镜像）→ 工作树，**绝不用工作树覆盖 git 仓库**（工作树过期时不会回退仓库里更新的提交）。
- 该脚本按 `git ls-files` 只处理被跟踪的文件（`.gitignore` 生效），把仓库提交的内容镜像回工作树；工作树独有的文件不会被删除。
- 若确实要反向同步（工作树 → 仓库），用显式开关 `--from-dev`（默认关闭）。
- 运行时素材（`public/assets` / `public/fonts` / `public/vendor`）**连同源码一起提交**，所以克隆即得。
- 凭据**从不写进仓库**：GitHub 用**主人自己的**凭据（`gh auth login` / 凭据管理器已登录，或当次 `GITHUB_TOKEN`），Gitee 用登录名 + 私人令牌（`--interactive` 一次性登录，或当次环境变量 `GIT_USERNAME` / `GIT_PASSWORD`）——脚本一律在仓库外的临时文件里使用。

**部署约定**（上线到自己的服务器时）：**先推通知、再上传 / 重启**。重启或上传服务端文件前，先在管理页 `/admin?token=…` 的「通知」面板给在线玩家推一条告示，署名默认 **`d星空之下`**，内容说清这次更新了什么、大约多久、请刷新页面；纯静态（`public/**`）改动不重启但**同样先推通知**。完整步骤见 [`docs/AI-WORKFLOW.md`](docs/AI-WORKFLOW.md)。

## 六、文档

| 文档 | 内容 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | **AI agent 入口**：唯一规则、查询表、守则 |
| [`docs/HANDOVER.md`](docs/HANDOVER.md) | **接手入口**：仓库地图、本地运行、构建 / 测试、内容制作、主线合并、发布与部署、已知坑 |
| [`docs/QUERY-INDEX.md`](docs/QUERY-INDEX.md) | **问题 → 文档 → 代码文件** 查询索引 |
| [`docs/PROJECT-STATE.md`](docs/PROJECT-STATE.md) | 当前状态一页纸：线上、开关、备份、已知问题 |
| [`docs/PLAYING.md`](docs/PLAYING.md) | 玩法指南：流程、经济、招募与晋升、摆阵、联防、盟约、最终攻势、结算称号 |
| [`docs/MATCHMAKING.md`](docs/MATCHMAKING.md) | **我们的改动与全部决策记录**：账号 / 野排 / 观战夺舍 / 8 名自造干员（§1–§46） |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | 仓库地图与构建 / 测试 / 素材流水线 |
| [`docs/DEV-GUIDE-ZH.md`](docs/DEV-GUIDE-ZH.md) | 同一张地图的中文版 + 二次开发手册 |
| [`docs/AI-WORKFLOW.md`](docs/AI-WORKFLOW.md) | 我们怎么研究 / 改动 / 测试 / 合并 / 部署，以及推送约定 |
| [`docs/OUR-FEATURES.md`](docs/OUR-FEATURES.md) | **只属于本 fork 的机制目录**（合并时不得丢失） |
| [`docs/UPSTREAM-MERGES.md`](docs/UPSTREAM-MERGES.md) | 主线合并逐批记录 + **永不合并清单**（§0） |
| [`docs/DESIGN.md`](docs/DESIGN.md) | 设计文档索引：现行规则在 [`docs/design/`](docs/design/)、各次修订在 [`docs/history/`](docs/history/) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 代码地图：服务器、联机协议与前后端共用的战斗模拟 |
| [`docs/DATA.md`](docs/DATA.md) · [`docs/SIM.md`](docs/SIM.md) · [`docs/META.md`](docs/META.md) | 生成数据 / 战斗引擎 / 对局引擎参考 |
| [`docs/ASSETS.md`](docs/ASSETS.md) · [`docs/BALANCE.md`](docs/BALANCE.md) · [`docs/I18N.md`](docs/I18N.md) | 素材流水线 / 难度模型 / 多语言 |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | 部署指南：防火墙、开机自启、反向代理与 HTTPS、Docker |
| [`docs/NEW-OPERATOR.md`](docs/NEW-OPERATOR.md) | 新增自造干员的端到端配方 |
| [`docs/CONTENT-AUTHORING.md`](docs/CONTENT-AUTHORING.md) | 内容制作手册：新盟约 / 新策略 / 新悬赏敌人 / 新干员，及资料库与 3D 板主题 |
| [CHANGELOG.md](CHANGELOG.md) | 更新记录 |

## 七、目录结构

| 路径 | 内容 |
|---|---|
| `server/` | 入口 `index.js`；Node HTTP 静态服务 + WebSocket（`/ws`，代码在 `http/`）、大厅、对局引擎（`match/`）、战斗模拟（`sim/`，浏览器与服务器共用） |
| `shared/` | 前后端共用的常量与线协议（`constants.js` / `protocol.js` 等） |
| `public/` | 浏览器客户端（原生 ES 模块，PixiJS + pixi-spine、three.js 3D 棋盘、Preact + htm）；**`public/assets` / `public/fonts` / `public/vendor` 在本仓库被跟踪** |
| `data/` | 由官方数据表生成的游戏数据与素材清单 `assets.json` |
| `tools/` | 数据构建（`build-data.mjs`）、素材（`fetch-assets.mjs`）、golden、打包、本地提取（`local-extract/`）、`push-gitee.mjs` |
| `scripts/` | 启动脚本（Windows / macOS / Linux）与 Windows 开机自启 |
| `docs/` | 文档与调研；我们的决策记录在 `docs/MATCHMAKING.md` |
| `test/` | `node:test` 测试 |

## 八、致谢与许可

- **主线项目**：[`sganggs/Stronghold-Protocol`](https://github.com/sganggs/Stronghold-Protocol) 及其所有贡献者 —— 本项目（**分支项目**）的代码基线、设计文档、数据管线与素材清单都来自主线。主线解决的问题由主线记录；本仓库只负责**我们这一版**。
- **游戏数据来源**：[`Kengxxiao/ArknightsGameData`](https://github.com/Kengxxiao/ArknightsGameData)。
- **素材来源**：[`yuanyan3060/ArknightsGameResource`](https://github.com/yuanyan3060/ArknightsGameResource)、[`fexli/ArknightsResource`](https://github.com/fexli/ArknightsResource)、[`isHarryh/Ark-Models`](https://github.com/isHarryh/Ark-Models)、[`ArknightsAssets/ArknightsAssets2`](https://github.com/ArknightsAssets/ArknightsAssets2)；字体来自 [`TimWangZi/The-font-of-Arknights`](https://github.com/TimWangZi/The-font-of-Arknights) 与 Google Fonts（Noto Sans SC）。
- **规则核对参考**：[PRTS 明日方舟中文 Wiki](https://prts.wiki/)。
- **版权与许可**：《明日方舟》相关的美术、音乐、音效、文本与数据等版权归**鹰角网络（Hypergryph）/ Yostar**及其权利人所有，**不适用** GPL；本仓库为社区便利把这些素材一并分发，是维护者本人的决定，**不得用于商业用途**，也不得单独再分发。本项目自己编写的代码以 **GPL-3.0-or-later** 发布，全文见 [LICENSE](LICENSE)；第三方组件各自遵循其许可证，清单见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。条款细节见 [NOTICE.md](NOTICE.md)。

感谢主线项目与以上所有来源的作者、维护者，以及鹰角网络带来的这款游戏。

---

## English

The **primary repository** (GitHub) of our independently maintained secondary-development build of Arknights' seasonal auto-chess tower-defense mode *Stronghold Protocol: Alliance*, played in the browser: solo, or 1–4 player co-op — with a **Gitee mirror for downloads from mainland China**. **This is not the upstream project** — the original source is [`sganggs/Stronghold-Protocol`](https://github.com/sganggs/Stronghold-Protocol), which we credit and periodically merge. Our additions include account/matchmaking/spectate features, **eight** custom shop operators, and a set of rule decisions recorded in [`docs/MATCHMAKING.md`](docs/MATCHMAKING.md). New here? Start with [`docs/HANDOVER.md`](docs/HANDOVER.md).

- **Run:** Node.js 22 or 24; `git clone` this repository (the runtime art under `public/assets`, `public/fonts` and `public/vendor` is tracked, so a clone runs without fetching art), then `npm install` and `node server/index.js` → <http://localhost:3000>. The admin panel is at `/admin?token=…` (token in `var/admin-token.txt`). Tests: `node --test` and `npm run golden`.
- **Updates:** `node tools/push-gitee.mjs -m "…"` commits what you staged in the git store, pushes it to every configured remote (the **GitHub primary** then the **Gitee mirror**), then mirrors the store back into the working tree (one-way: store → remotes → working tree; it never overwrites the store with the working tree); see [`docs/AI-WORKFLOW.md`](docs/AI-WORKFLOW.md) for the notice-then-deploy convention.
- **Disclaimer:** not affiliated with or endorsed by Hypergryph or Yostar. All Arknights names, art, audio, text and data are © their respective owners and are **not** covered by this project's GPL licence; they are redistributed here for the community's convenience, by the owner's decision, and must not be used commercially. Content will be removed on request of the rights holders. Code: GPL-3.0-or-later ([LICENSE](LICENSE)).
