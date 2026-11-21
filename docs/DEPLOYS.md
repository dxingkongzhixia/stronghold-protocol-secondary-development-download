# 部署日志（倒序）

<!-- doc: role=history status=history -->

> 迁移自 `docs/PROJECT-STATE.md`（2026-11-21，文档重构）。**当前状态**见 [PROJECT-STATE](PROJECT-STATE.md)。
> 每次上线遵循：站内通知（`sign: d星空之下`）→ 备份 → 上传增量 → 重启（仅当 `server/**`、`shared/**` 变化）→ 校验 `/healthz` build。
> 没有 owner 明确许可，**不上线**（默认「先不上线」）。

### 最近部署（倒序）

| 时间 | 代码 | build | 更新日志 | 要点 |
|---|---|---|---|---|
| **2026-11-21 12:31** | `9b0e4ac50` | **`9095519f82f1`**（重启） | —（未发更新日志） | **11-19/11-20 积压批次 + 闸门修复**：23 个已推提交（规程 boss/敌人/干员按 PRTS 修正 + act3 golden 重算、主题包（zip 导入 / 配色图片槽 / 标题 Spine / 官方语音）、showtag 数值、规程 MAP09 隐匿地格特效、文档）+ 闸门修复（`shared/animRoles.js` JSDoc、en 8 条文案、`allyMark` 视觉、古雕伥模型改归 `spine/enemy`（新增 `TOKEN_ENEMY_SPINES`，本地分组 174）、铳/冻河 3 个用例按 PRTS 更新）。**无素材变更**：`public/assets`、`fonts`、`vendor` 本批零 diff，中继已推到 `9b0e4ac50`。通知（`d星空之下`；更新前一条、推迟更正一条、重启前再一条，`sent:2`）→ 备份 `/root/sp-backup-code-20261121-122838.tgz`（1.1 GB）→ 增量 **40 文件 / 535 KB**（`git archive 7d05e7167..9b0e4ac50`，排除 test/tools，无删除）→ 解包 `chown www:www` → `/root/restart.sh`（TERM pid 279135 → 新 pid 301348）→ `/healthz` build `9095519f82f1` == 磁盘 `computeBuildTag()`，公网 `https://strongholdprotocolcsym.top:10785` 同 build；`/js/themePacks.js`、`/js/ui/showTags.js`、`/js/zip.js`、`/js/render/fx/kinds.js`、`/i18n/en.json`、`/shared/themePack.js` 全 200；重启后日志无 uncaught/error，Keel 10 插件 loaded；重启时 2 局在打（已提前通知，`matches` 归零）。中继 / GitHub `master` = `9b0e4ac50`，Gitee 代码快照 `c6b407540a` |
| **2026-11-19 01:13** | `5c738f19a` | **`9c6bd500aa28`**（重启） | —（未发更新日志） | **大厅版本切换 + 规程季界面**：顶栏官方版本切换（`ui/versionChip.js`）、规程季背景（`ui/regulationBackdrop.js`）、**规程开场动画**（`ui/regulationFilm.js`，自带 prefab 播放器）、大厅按版本加载数据整集（`content.js`：切规程后干员调配/报告/图鉴读到 310 条名册）；规程 8 名干员的本地客户端模型/头像/立绘 + fx 索引（5564 prefab）+ 寒檀冰锥 0.6 s / 冻河 S1·S2 绑定 / 后兽键名修复 / 两批 `FX_COVER`；act3 场景还原为仓库版。相对 `c11b446de` **1445 文件 / 32.4 MB**（1405 素材），删除 `public/js/ui/equipArea.js`（宿主已删）。通知（`d星空之下`，发送时 0 人在线）→ 30 s → 备份 `/root/sp-backup-code-20261119-011230.tgz`（325 MB，含 `skins/sets`）→ 增量解包 `chown www:www` → TERM `:3000`（pid 249034）→ `server.sh` 拉起 → `/healthz` build `9c6bd500aa28` == 磁盘 `9c6bd500aa28`，公网同 build；`/js/ui/versionChip.js`、`/js/ui/regulationFilm.js`、`/assets/local/spine/char/char_4163_rosesa/front/*.skel`、`/assets/local/fx/index.json`、`/data/versions/act3autochess-v3_1/chess.json` 全 200。中继 `master` = `5c738f19a`，GitHub `master` = `5c738f19a`，Gitee 代码快照 `a7305e9bd` |
| **2026-11-10 19:49** | `53b02b2` | **`811f6d51b5e7`**（重启） | — | **插件目录描述与作者修复**：`shared/plugins/manifest.js` 把 v2 的字符串描述包成语言映射（此前 `{...string}` 被展开成逐字符对象，**所有插件**的介绍都为空）；`server/plugins/builtin.js` 的内置阵营插件作者改为 **`d星空之下`** 并恢复中英双语描述。通知 1 人 → 备份 `/root/sp-backup-plugin-20261110-194838.tgz`（23 KB）→ 增量 23 KB → 解包 `chown www:www` → TERM `:3000`（pid 91761）→ `server.sh` 拉起 → `/healthz` build `811f6d51b5e7` == 磁盘；`/plugins/index.json` 校验 `faction-rhodes` 描述 `{zh,en}`、作者 `d星空之下`。**此前两批纯静态**：11-10 00:10 阶级标改官方 `chess_level_icon` 贴图（`7cc45d2`，备份 `sp-backup-ui-20261110-001004.tgz`）；11-07 22:23 全干员技能音效 + 莫斯提马 S2（`d290a8b`，备份 `sp-backup-code-20261107-222333.tgz`） |
| **2026-11-02 15:07** | `2418560b6` | **`1b3b0555e9e9`** | **`0.4.78`** | **11-02 Keel 批次**：运行指标（`scanMs` / 逐模块 `loadMs` / Worker 堆 / `/admin/api/plugins/stats` / 运行指标页）、版本锁与回滚（`plugins/lock.json` + `_locked` + `/admin/api/plugins/lock`）、模块/权限矩阵（31 能力）、`content.extend` 对齐、`policy.decide` 返回值与 `match.economy.write` 落地。Delta `6bb46083b..2418560b6` **63 文件 / 619 KB**，无删除；备份 `/root/sp-backup-20261102-150632.tgz`（845 MB）；通知 5 人（**0.4.78**；首次 0.4.77 编码乱码已 `published=0`）→ 解包 → 重启 pid `17050` → `/healthz` build == 磁盘 `1b3b0555e9e9`；`/admin/api/plugins/stats`、`/admin/api/plugins/lock` 200，10 插件 loaded，GFBF / WDXW 新局正常。Gitee / GitHub `master` 均已推到 `5196e0320`（GitHub 推送时临时绕过失效的 `127.0.0.1:31181` 本地代理）。 |
| **2026-11-01 19:45 / 20:12** | `af5dd4ae2` (+ 20:12 修正) | **`b49428e00de2`**（20:12 移除 `faction-bolivar` 后） | **`0.4.76`**（20:12 补录） | **11-01 批次**：新 6★（塔露拉 / 冻河 / 国度 / 丰川祥子）+ 引擎（簇火 / trigger-effect / hold / Fever）+ 官方 prefab 逐帧对齐 + Keel 插件系统。玻利瓦尔素材上传但 **不上线**（chess 隐藏；20:12 移除 `data/builtin/faction-bolivar.json` 与 `faction-columbia.json`，builtin 7 个，插件目录无 bolivar）。相对 `b67edb239` 33 提交 / 1609 变更 / 86 删除；增量 **1512 文件 / 21.4 MB**（排除 `plugins/bolivar/**`）；通知 14 人 → 备份 `/root/sp-backup-20261101-194421.tgz` → 解包 → 删旧文件 → 重启 → 完成通知 4 人 → 更新日志 0.4.76（5 人）；`/healthz` == 磁盘 `b49428e00de2`；黑蛇迁移 `plugin.keel.json` 后 Keel 10 插件加载 |
| **2026-10-28 23:30** | `5cbb2219f` | **不变 `ae49791767eb`**（只传静态文件、未重启） | — | **干员调配详情抽屉移到左侧**：`.lo-drawer` 从 right 改 left（宽 640px），deck 让出 `padding-left`，动画/阴影/收起箭头换向；**点卡片外的空白区域收起**（卡片/按钮/输入保留自己的点击）。生产 1920×1080 实测抽屉 `left=0`、空白关闭、无报错 |
| **2026-10-28 23:10** | `166555b9e` | **不变 `ae49791767eb`**（只删静态文件、未重启） | — | **移除动态皮肤实验**：评估结论与后续方案见 [`FUTURE-FEATURES.md`](FUTURE-FEATURES.md)。删除 `public/assets/dynillust/`（约 276 MB）、`ui/hub/dynIllust.js`、抽取/缩略图工具、测试与文案；生产用 `/root/sp-backup-dyn-20261028-220038/` 恢复上线前前端、删除素材目录。官方动态场景是 Unity 网格/粒子/animation，pixi-spine 无法还原；以后按 FUTURE 文档的 A（Unity→glTF/three.js）或 B（录像）再做 |
| **2026-10-28 17:53** | `82d108f66` | **`ae49791767eb`** | — | **漂移修正**：补传 `server/speed.js`（阈值 1.2/0.5 → **0.4/0.8 MB/s**）与 `public/css/screens/achievements.css`（成就卡 `1.02/0.62×0.66` → `1.18/0.72×0.78`）；只覆盖 2 个文件、未另打包（旧文件在 17:10 的备份里）；通知 4 人 → 重启 → 完成通知 3 人；`/admin/api/speed` 实测 `{relay: 419430.4, mirror: 838860.8}`、选源「中继」；CSS 含 `1.18 * var` / `0.72 * var`；`/healthz` == 磁盘 `ae49791767eb` |
| **2026-10-28 17:10** | `6570d1ade` | **`4e11d39c1e3e`** | —（未发更新日志） | 召唤物时装（51 召唤物 / 72 套，`local-skins-tokens` 8.7 MB）+ #800 结算按钮 + #786 开技能转正面；相对 `459576478` 25 文件 / 0.41 MB；通知 4 人 → 备份 `/root/sp-backup-20261028-170837.tgz` → 解包 → 重启 → 完成通知 3 人；`/healthz` 线上 == 磁盘 `4e11d39c1e3e`，catalogue 3 套 / 51 召唤物 / 72 套、2616 个 `/skins/` 文件 0 missing |
| **2026-10-28 00:20** | `3f698f2e2` | **不变**（`379fd659d3ff`，只传静态文件、未重启） | —（纯性能修复，未发通知） | **首屏不再等全量预载**：`boot()` 渲染标题后才在后台跑 `preloadArt`（延迟 800 ms，上限 20 s，取消后按需加载）；**镜像测速阈值**改为中继 **0.4 MB/s** / 普通镜像 **0.8 MB/s**（`public/js/assetMirror.js`）；只上传 `public/js/main.js`、`public/js/assetMirror.js`（`server/speed.js` 的测速页阈值要等下次重启才对上），备份 `/root/sp-backup-static-20261028-002030/`。线上实测标题输入框 **3.2 s** 出现（原 **63.3 s**），控制台无报错，后台仍在继续拉图 |
| **2026-10-27 22:56** | `80a46958e` | **`379fd659d3ff`** | **`0.4.75`**（23:05 完成通知写入；部署前那条**只发了通知、没勾「写入更新日志」**，所以当时日志停在 0.4.74） | 技能音效补全 331 条 + 71 张新立绘（本地 CN 客户端抽取）、攻击收尾 `MIN_ATTACK_TAIL`、内存优化（content set 释放 / `MAX_KEPT` 6 / `MAX_HOSTS` 6 / 512 MB heap）；相对 `d62b97ad1` 6 个提交 / 423 个文件，增量包 9.07 MB、0 删除；先推通知（14 人）→ 备份 `/root/sp-backup-20261027-225328.tgz` → 解包 → 重启 → 完成通知（7 人，`changelog: true` → 更新日志 **0.4.75**）；中继 `master` 同为 `80a46958e`；`/healthz` 线上 == 磁盘 `379fd659d3ff` |
| **2026-10-27 17:02** | `d62b97ad1` | **`b8f6defd0d1b`** | —（未发更新日志） | 皮肤修复（`build` 补回 `plugin.lock.json` 的 `anims`）+ 主线 0.3.2 战斗修正批 A 12 项 + 魔王微尘光环；相对 `fce35d298` 34 个提交 / 63 个文件，增量包 1.07 MB；先推通知（4 人）→ 备份 `/root/sp-backup-20261027-165902.tgz` → 解包 → 重启 → 再补一条完成通知（3 人）；`/healthz` 线上 == 磁盘 `b8f6defd0d1b` |
| **2026-10-23 19:57** | `2adf3c7ee` | **`3586e9a2570f`** | **`0.4.71`** | 修复准备按钮点击与临时整备区：按钮不再使用原生 `disabled`，忙碌/过期状态不再锁死；临时整备区非空时点击准备会提示「清空并准备」（出售角色、销毁物品后继续）。**缓存策略改为 app shell / JS / CSS `no-store`**；`/assets`、`/fonts`、`/vendor` 继续长缓存。Gitee / GitHub / 中继均为 `2adf3c7ee`；备份 `/root/sp-backup-code-20261023-195733.tgz` |
| **2026-10-23 19:34** | `42f77f6a7` | **`e70a15e1be0a`** | **`0.4.70`** | 准备按钮不再被原生 disabled 吞掉点击；新增临时整备区清空动作；同批同步 Gitee 585d 的 PRTS / 黑蛇 / FX / 大厅改动；通知 11 人，备份 `/root/sp-backup-code-20261023-194809.tgz` |
| **2026-10-21 11:10** | `c294705f2` | **`275f096dcd2e`** | **`0.4.48`** | 手机横屏棋盘相机居中放大 20%，棋盘和干员更大；备份 `/root/sp-backup-zoom-20261021-110922.tgz` |
| **2026-10-21 10:55** | `9d831c040` | **`ef0c9d7486c6`** | **`0.4.47`** | 手机端短屏按可视高度缩放、修复 44px 触控点击区、移动端清晰度提升、全屏不再重复锁定已横屏方向；备份 `/root/sp-backup-mobile-20261021-105448.tgz` |
| **2026-10-21 09:37** | `87d238556` | **`8a8994f8ec2f`** | **`0.4.46`** | 修复战斗 HUD 全屏层拦截画布点击，战斗中点干员可正常打开详情；备份 `/root/sp-backup-game-css-20261021-093733.tgz` |
| **2026-10-20 17:39** | `9b84a1314` | **`d9f6e307b41e`** | **`0.4.43`** | 插件 zip 发布到资源中继，商城和本机插件显示「高速下载/服务器」；服务端搜索分页、浅色商城、RBAC、trusted 容器检查工具；备份 `/root/sp-backup-code-20261020-173702.tgz` |
| **2026-10-20 17:05** | `ff1f6a024` | **`9f31f769a4a8`** | **`0.4.42`** | 依赖解析、Ed25519 签名与后台密钥 UI、签名策略、安装/卸载、审计查看器、GC、AI 只读 preview、后台导入进度、商城详情弹窗；备份 `/root/sp-backup-code-20261020-170402.tgz` |
| **2026-10-20 15:03** | `e557fdcac` | **`949f04c8f51b`** | **`0.4.41`** | 插件后台二级导航、紧凑表格 + 编辑抽屉、浅色模式、后台导入、位置排序、关联插件绑定；商城显示关联插件；后台 API 空响应不再抛原始 JSON 错误；备份 `/root/sp-backup-code-20261020-150248.tgz` |
| **2026-10-20 14:23** | `573fc0095` | **`e7f0b543f53f`** | **`0.4.40`** | 插件商城与后台管理：本服/主线兼容分栏、原生大文件下载、描述/作者/app/API/上架后台编辑、本机插件元数据、打包上架、AI 接管预留接口；插件管理改卡片布局；备份 `/root/sp-backup-code-20261020-142112.tgz` |
| **2026-10-20 13:56** | `48756d408` | **`5c406322128a`** | **`0.4.39`** | 商城显示插件类型（class）与兼容性：`app` / `api` / `compat`；主线 0.3.x 的外观 / 界面 / 语言自动兼容，内容 / 脚本 / 信任显示严格并提示 owner `allowIncompatible`；增加类型筛选；备份 `/root/sp-backup-code-20261020-135448.tgz` |
| **2026-10-20 13:51** | `7119323f1` | **`34fe0b4a137b`** | **`0.4.38`** | 插件商城改版：条形列表、搜索、普通 / Forge / 本机分栏与类型徽章；上传独立为 `/market/upload/`；本机已安装插件可下载；标题页改用新标签打开商城，返回不再重载游戏；备份 `/root/sp-backup-code-20261020-134501.tgz` |
| **2026-10-20 13:13** | `9d0c89ba4` | **`4d2bc20b9b13`** | —（热修） | 商城热修：本机已安装插件保留本地化显示名；备份 `/root/sp-backup-code-20261020-131303.tgz` |
| **2026-10-19 23:50** | `582937679` | **`808e1296c766`** | **`0.4.36`** | 主线 0.3.1 / 0.3.2 追平（插件 / Forge / studio / 控制台 / Worker 托管 / 官方特效 / 统计 `withModded` / 插件干员官方美术）+ **本机抽取的 274 套官方时装**（`local-skins` + `local-skins-2`，房间默认开启，约 287 MB/set）；备份 `/root/sp-backup-code-20261019-235029.tgz`；**10-20 热修管理页 CSP**（站点策略只哈希 import map，管理页的内联脚本被浏览器拦截 → 服务端为 `/admin` 单独补上脚本哈希，build 不变，需重启） |
| **2026-10-18 00:35** | `26294b7a` | **`85b981d393f6`** | **`0.4.34`** | 统计页改版（记录格式 v2 + 官方素材 37 件）、去掉部署缩放、**分血救援**、公开房间列全部；**全源码包**覆盖（事故见下） |
| **2026-10-18 01:42** | `390740b2` | `85b981d393f6`（不变：BUILD_INPUTS 不含 `server/match`） | —（热修，无公告） | **字段静默看门狗**（普通 / 联防客户端字段 12 s 无上报即服务端接管）+ 管理页每房 `phase/round/deadline/fields`；**重启**结束卡住的 `RGHY` |
| 2026-10-17 00:31 | `20f3437d` | `adea09d5e893` | `0.4.31` | 官方特效还原度（`strikePose` / `comeBack` / `LOOP_BUFF_BOUND`）+ 望 S3 跟子 + 官方数据刷新 + 召唤物模型 |
| 2026-10-16 晚 | `e0758c50` | `90f5e7f2c477` | `0.4.28` | 望 S3「天下劫」棋子范围 `x-6` → `x-1`（只改数据） |
| 2026-10-15 | `4e6058f8` | `47c37209549a` | `0.4.25` | 内容上只有文档，**仍必须重启**（`buildTag` 进程内缓存） |
| 2026-10-14 | — | — | `0.4.8` | 首次 0.4.x 上线（备份 `/root/sp-backup-deploy-20261014-024306.tgz`） |

**2026-10-23 19:57 详情**：准备按钮修复 + 缓存策略调整。按钮不再使用原生 `disabled`，`toggleReady` 用 `try/finally` 清理 busy，阶段/回合切换时重置；临时整备区非空时点击准备会提示 **「清空并准备」**（角色出售、物品销毁后继续）。应用外壳/JS/CSS 改为 `no-store`，避免 `?v=` immutable 一年导致旧代码不更新；`public/assets`、`public/fonts`、`public/vendor` 仍长缓存。生产 `build 3586e9a2570f`，通知 9 人，备份 `/root/sp-backup-code-20261023-195733.tgz`；Gitee / GitHub / 中继 `master` 均为 `2adf3c7ee`。

**2026-10-18 00:35 详情**：本批 = **统计页改版**（schema v2、官方素材 37 件、页面改版）+ **去掉部署折叠缩放**（`#602`/`#646`，进 §0）+ **分血救援**（`MATCHMAKING` §50）+ **公开房间列全部**（`/online/api?all=1`）。
顺序：仓库 `26294b7a`（github + gitee，github 多次 408/502 后成功）→ **中继先行**（`9705f67f..26294b7a`，`relay deploy done`）→ **通告**（署名 `d星空之下`，更新日志 `0.4.34`，在线 6 人收到）→ 上传 → 解包 → **重启**。
结果：`build 85b981d393f6`（线上 == 磁盘 ✓）、`STATS_VERSION = 2`、37 件统计素材 + 清单 `d679d790308a`、`teamPanel` 有 `onShareHp`、`game.js` 无 `deployFold`、`rooms.js` 有 `all=1`、`DONATE: 1`；首页 / 统计页 / 队伍栏 / `shared/stats.js` / i18n / 统计素材 / `/online/api` 全 200。**03:30 的定时重启已从 cron 移除**（它会重新解包旧包）；训练 cron（04:30/05:30）保留；`var/training.db` **懒创建**（首个采样落库时出现）。

> ⚠️ **踩坑（已修）**：第一版增量包是 `git diff 8b4fdbd2..HEAD` —— 但盒上 18:52 那份树其实**早于 `8b4fdbd2`**（缺 layer 1 的 `server/sim/spec.js` 等），漏传 `creditedKillsOf` → 重启时 `bossRounds.js` 报 `does not provide an export named 'creditedKillsOf'`，服务**停了约 2 分钟**；改用**全源码包**（`public/js`、`public/css`、`public/i18n`、`shared`、`server`、`data`、`tools`、`docs`、`test`，33 MB）整体覆盖后恢复。**教训：盒上无 git，增量包必须相对盒上真实状态做（或直接全源码覆盖）**。


## 2026-10-20 上线记录

- 代码：`c78842932`（插件商城、运营台策略写入/审计、脚本 probe 磁盘缓存/指标、自选官方标签、玩家风险说明、标题页设置/全屏样式）
- 生产：`/www/wwwroot/Stronghold-Protocol`
- 备份：`/root/sp-backup-code-20261020-125947.tgz`
- 重启后 build：`74e95a248cb0`（== 磁盘 build）
- 社区更新日志：`0.4.37`
- 验证：
  - 内网 `http://127.0.0.1:3000/healthz` OK
  - 外网 `http://183.66.27.19:20522/healthz` OK
  - `/market/` 200，`/market/api/list` 200
  - 管理员通知已推送（6 人在线收到）
- 上线时间：2026-10-20 13:00（CST）

## 2026-11-17 上线记录（规程 3 期地图 / 预览栏 / 装备区 / 画质）

- 代码：`6397dbaa1`（含 `82a3ee4e3` 地图按官方图重做、`93645f980` 装备区与 prep 相机、`6397dbaa1` 移除顶部 Boss 预览栏）
- 生产：`/www/wwwroot/Stronghold-Protocol`
- 备份：`/root/sp-backup-code-20261117-232722.tgz`（6.6 MB）
- 增量包：`/root/sp-delta-final.tgz`（42 MB / 38 文件：`data/versions/`、`public/js`、`public/css`、`public/assets/local/scene/act3autochess_m01..m12`）
- 重启后 build：`3af651a08162`（== 磁盘 `computeBuildTag()`）
- 验证：
  - 内网 `http://127.0.0.1:3000/healthz` OK；外网 `http://183.66.27.19:20522/healthz` 与 `https://strongholdprotocolcsym.top:10785/healthz` 同 build
  - `act3autochess_m09`：`config.enemy_place_rect = ((8,21),(12,27))`、row 8 装备行 `####AAAAA###fffffff##`、row 14 全 `#`
  - 线上 `view.js` 含 `fullField`、`theme.js` 含 `icewild` / `church`、`equipArea.js` 含 `equipRowRect`、CSS 含 `equip--onrow`
  - `scene/tex` 清单 71 项且含 `TX_icewild_A` / `TX_church_tower_D`；`m09/lm0.webp` 2.4 MB（lossless）
  - 全量 `npm test`：9382 项 / 9344 通过 / 0 失败 / 38 跳过
- 中继与 Gitee 已推送；GitHub 推送因本机 `:443` 连接重置暂未完成（稍后重试）。
- 上线时间：2026-11-17 23:30（CST）
- **2026-11-18 补丁（已上线，build `defe04adcdc7`）**：按 owner 要求删除房间栏的「选择模拟协议」下拉
  （`screens/room.js` VersionLevelPicker + 其 CSS/文案/测试；服务端 `room.setMode` 保留）。单人 规程等级 1–20 的
  精确选择随之取消（按难度档位映射）；如需要，放到大厅「选择模拟协议」页做等级列表。
- **未完成（正在处理，见 [`HANDOFF-2026-11-18.md`](HANDOFF-2026-11-18.md)）**：3 期规程地图仍与主线不一致
  （row 8 多 7 格、rows 14–18 预览栏被清空、自造 `enemy_place_rect`），装备区买了不显示（自造悬浮层缺陷）。
