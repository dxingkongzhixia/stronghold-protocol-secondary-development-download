# 项目现状一览（PROJECT-STATE）

> 给「新会话 / 新接手的人」看的一页纸。**最后核对：2026-10-13**（数值为本地实测，见 §3）。
> 功能细节与每次改动的来龙去脉见 [`docs/MATCHMAKING.md`](MATCHMAKING.md)（§1–§41）。
> 接手入口见 [`docs/HANDOVER.md`](HANDOVER.md)；按问题查文档见 [`docs/QUERY-INDEX.md`](QUERY-INDEX.md)。

---

## 1. 这是什么

「卫戍协议：盟约」的非官方同人**网页联机复刻**：Node 服务器 + 浏览器客户端，1–4 人合作塔防。
基线是**主线项目**（`sganggs/Stronghold-Protocol`；已合并到 **feedback5**（含 **v0.2.0** + i18n，见
[`docs/MATCHMAKING.md`](MATCHMAKING.md) §33），并选择性并入 **feedback6** 与 **feedback7 的 R22 / R23**
两批——完整记录见 [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md)）。

本仓库是**基于主线开发的分支项目**，在主线之上独立维护：账号体系、野排匹配、公开同盟、在线状态与管理页、**观战 + 夺舍 AI**、
**大厅社区（更新日志 / bug提交 / 公开房间）**、启动体验与带宽治理、**8 名自造干员**（§4；
`tools/build-data.mjs` 的 `CUSTOM_CHESS`）、**GitHub 主仓库 + Gitee 国内镜像**。

## 2. 目录与「唯一真相」（都在 `D:\DOTK`）

| 路径 | 说明 |
|---|---|
| `Stronghold-Protocol\` | **工作项目 / 运行目录**：**没有 `.git`**，是 git 仓库的**逐字节镜像**（**不是**真源）。`node server/index.js` 在这里跑。 |
| `_merge-scratch\` | **唯一的 git 仓库 / 完整历史 / 唯一真相**（分支 `ours`）。提交、合并、推送都在这里；`node tools/push-gitee.mjs` 把 `HEAD` 推到所有远程，再把被跟踪文件镜像回工作项目。**单向：store → 远程 → 工作树**，绝不用工作树覆盖仓库（反向须显式 `--from-dev`）。 |
| `Stronghold-Protocol-github\` | 干净主线克隆（`master`）。 |
| `_optim-backup-*\` | 每次改动前的本地备份（名字含「日期-主题」）。 |

> ⚠️ store 里的 `.cache` / `public/assets` / `public/fonts` / `public/vendor` 是**指向工作项目的 junction**，约 600 MB 美术只有一份。**别单独删工作项目**，也别把 store 的 `public/assets` 当副本删掉。

## 3. 当前状态（2026-10-13 本地实测）

| 项 | 值 |
|---|---|
| 版本 | `app 0.4.0`（`package.json` / `shared/constants.js APP_VERSION` / `CHANGELOG.md` 三处一致） |
| git store | `_merge-scratch`，分支 `ours`（tip 每次提交都在变，用 `git -C D:\DOTK\_merge-scratch rev-parse --short HEAD` 查）；工作项目与 store HEAD **零跟踪漂移** |
| 远程同步 | `gitee/master` == HEAD；`github/master` 曾落后一个提交（`31bba4af`，本次已随发布补齐）；主线 `origin/master` = `488db49f` |
| 全量测试 | `node --test`：**6129 项 / 6118 通过 / 0 失败 / 11 跳过**（约 267 s，在 store 里跑） |
| 其它闸门 | `build-data --offline` 数据零漂移；`kit-coverage` 307/307 技能、120/120 棋子；`i18n check en --strict` 1360/1360；`doctor` 退出码 0 |
| 本机环境 | Node **v24.19.0** |
| 本地服务 | `node server/index.js` 于 `:3000`（`/healthz` 正常；`build` 为本地源码哈希，非线上 build） |

## 4. 线上

| 项 | 值 |
|---|---|
| 地址 | **http://183.66.27.19:20522**（NAT：内网 3000 → 外网 20522） |
| 版本 | `app 0.4.0`；build 见 `/healthz` |
| 主机 | RainYun Debian KVM；SSH `root@183.66.27.19 -p 45217` |
| 面板 | 宝塔 `https://183.66.27.19:32467/rainy`（用户 `rainyun`） |
| 项目 | `/www/wwwroot/Stronghold-Protocol`，跑在 `www` 用户，`npm run start` |
| 管理页 | `/admin?token=<var/admin-token.txt>`（令牌 + 30 天 cookie）；公开只读 `/online/api` |
| 进程管理 | 宝塔「Node项目」脚本 `/www/server/nodejs/vhost/scripts/server.sh`（`setsid` 启动）；日志 `/www/wwwlogs/nodejs/server.log` |

**部署流程（当前做法）**
1. 本地 `node --test` 全绿；
2. 打包（不带超大 / 本机文件）：
   ```
   tar -czf sp-full.tgz --exclude=./node_modules --exclude=./public/assets --exclude=./public/vendor \
     --exclude=./public/fonts --exclude=./.cache --exclude=./var --exclude=./logs \
     --exclude=./test/e2e/out --exclude=./data/local-assets.json .
   ```
3. `scp` 到 `/root/sp-full.tgz`；服务器解包 → `chown -R www:www .` → 目录 755 / 文件 644；
4. 停旧进程（按 `ss -ltnp` 里 `:3000` 的 pid，`kill -TERM`）→
   `su -s /bin/bash www -c 'setsid /www/server/nodejs/vhost/scripts/server.sh'`；
5. `curl http://127.0.0.1:3000/healthz` + 外网 `/healthz` 验证。

> **先推通知、再上传 / 重启**：发布前先在 `/admin` 的「通知」面板推一条告示（署名 `d星空之下`），
> 说清更新内容、大约多久、请刷新。**没有 owner 明确许可，不要部署**（当前指令：先不上线）。
> 客户端改完**刷新即可**（`/js`、`/css` 是 `no-cache`；build 变了开着的老页面会自动重载）。
> ⚠️ **`SP_VERIFY=sample` 只在 Windows 的 `server-start.cmd` 里设**，Linux 上没设 → 线上**服务端抽检复算 = off**。

## 5. 本项目相对主线的改动（速查）

- **账号**：内置 `node:sqlite` + scrypt；**代号 = 账号名**（2–12 字，大小写不敏感唯一）；**单账号单会话**（新登录踢旧 socket）；`auth.logout` 服务端解绑；游客可不登录直接进。
- **野排**：按难度分桶 / **5 分钟窗口**（`MM_WINDOW_MS`）/ 满 4 人立即开局 / 不足 **AI 补位**；**需登录**；取消 · 离开大厅 · 建房 · 进房 · 断线 · 过期**全路径退池**；**匹配中禁用创建房间**。
- **同盟**：建房可选**公开 / 不公开**；大厅「**公开同盟**」= 还在大厅有空位的房（点击**加入**）、「**正在模拟**」= 正在打的房（野排优先 → 有 AI 优先 → 人多优先，最多 4 个，点击**观战**）。
- **观战 + 夺舍 AI**：`room.spectate` / `room.takeOver { seat }` / `room.releaseSeat`；观战席在队伍列表下方；夺舍后可接管棋盘 · 资金 · 调配，可退出回观战席；**游玩者恒 ≤ 4**。**观战者不续命**：最后一名真人玩家离开 → 房间（含对局）立即销毁（§20.5）。
- **在线状态**：游客断线即离线；登录用户断线保留 **5 分钟**（`PRESENCE_GRACE_MS`）；大厅「在线 N」徽标 + 游戏内 `OnlineOverlay` + `/admin` 只读页。
- **大厅社区**（§36）：同一个 SQLite（schema v4/v5）上的三块——**更新日志**（首启从 `CHANGELOG.md` 导入一次；每次推送通知自动追加一条）、**bug提交**（标题 + 描述 + ≤4 图，按字节嗅探 png/jpeg/webp，限流 + 孤儿清理，管理端可筛选 / 排序 / 导出 / 放大）、**公开房间**（独立整屏 `screens/rooms.js`）。**玩家留言刻意不做**。
- **启动体验**：进标题前**预加载全部美术**（scope `all` ≈ 1910 张 / 104 MB，无跳过、无超时）+ 自托管背景视频（点击开声、无控件、标题出现即释放解码器）。
- **带宽治理**：`server/bootgate.js` **排队闸门**（同时只放一个客户端预加载；已缓存的访客不排队；断线 / 过期立即释放）。
- **8 名自造干员**（`tools/build-data.mjs` `CUSTOM_CHESS`；kit 在 `server/sim/content/kits/ops/`；见 §8）：阿斯卡纶 `ascln`、结城理 `makoto`、予愿安洁莉娜 `aglna2`、望 `wang`、澄闪 `gdglow`、娜仁图亚 `narant`、凯尔希·思衡托 `kalts2`、克莱门莎 `clemnt`（6★ 本源近卫）。
- **日语语音**：第二套语音树 `audio.voiceJp`；「设置 → 语音语言」切 中文 / 日本語（**默认日本語**，与界面语言无关）；选中语言逐条优先、缺则回退另一套；完整包带两套、精简包不带语音。
- **统计数据**：`public/js/ui/stats.js` + `screens/stats.js`；**已同步服务器**（schema v5 `match_stats`），登录绑账号、游客绑本机会话身份，按 owner 隔离，可跨设备查看；统计页优先读服务器、断网回退 `localStorage`；上限取主线 **2×**（2000 局 / 最新 60 局完整 / 每 owner 1.6M 字符）。
- **发布**：`node tools/push-gitee.mjs` 推 `HEAD` 到 `github` 主仓库 → `gitee` 国内镜像 → 分支 `master`（快进、绝不强推），再镜像回工作项目。主线仍是 `origin`。

## 6. 环境开关 / 常量

| 项 | 值 | 位置 |
|---|---|---|
| `MM_WINDOW_MS` | `300000` | `shared/constants.js` |
| `AUTH_NAME_MAX` / `NAME_MAX_LEN` | `12` | `shared/constants.js` |
| `PRESENCE_GRACE_MS` | 5 分钟 | `shared/constants.js` |
| `LOBBY_DEFAULTS.bootSlots` / `bootHoldMs` | `1` / `180000` | `server/lobby.js` |
| `SP_VERIFY` | `sample`（**仅 Windows 启动脚本**） | `server-start.cmd` |
| 静态缓存 | `/assets\|fonts\|vendor` 7 天；带 `?v=` 1 年 immutable | `server/index.js` |
| `SP_ASSET_RATE_KBPS` | `1200`（服务器兜底素材下载限速 ≈1.2 MB/s；0 关闭） | `server/http/files.js` |
| `SP_ASSET_REF` | `master`（CDN 镜像钉的 git ref；空串关闭镜像） | `server/assetindex.js` |

## 7. 常用命令

```powershell
# 测试（在 store 里跑才有 .git；node --test 不接受末尾斜杠的目录参数）
cd D:\DOTK\_merge-scratch; node --test
# 本地起服务（工作项目 / Windows）
cd D:\DOTK\Stronghold-Protocol; .\server-start.cmd   # 或: $env:SP_VERIFY='sample'; node server/index.js
# 账号库
sqlite3 var/accounts.db                              # 表: accounts / sessions / match_stats ...
# 资源：本地客户端抽美术 + 抽语音；远程镜像走 gh-proxy
.venv-extract\Scripts\python.exe tools\local-extract\extract.py --game "<...\StreamingAssets\AB\Windows>"
.venv-extract\Scripts\python.exe tools\local-extract\extract-voice.py --ffmpeg "<ffmpeg.exe>"
node tools\fetch-assets.mjs --asset-source=mirror    # 直连被墙时用 gh-proxy 镜像
```

## 8. 备份 / 回滚

- **服务器**：`/root/sp-backup-*.tgz`（每次部署前打包 `server shared public docs [data]`）。回滚 = 解回项目 → 重新部署并重启。
- **本地**：`D:\DOTK\_optim-backup-<日期>-<主题>\`。
- **git 回退点**：tag `backup/pre-3d-scenes`、`backup-pre-groupA`，分支 `backup/ours-pre-reconcile-20261013`（见 [`docs/HANDOVER.md`](HANDOVER.md)）。

## 9. 已知问题 / 待办

- [ ] **`SP_VERIFY` 在 Linux 上没开**（线上不抽检战斗结果）。要开：在宝塔的 `server.sh` 加 `export SP_VERIFY=sample`（面板重建脚本会覆盖，注意）。
- [ ] **首屏带宽**：新访客仍要下 ~104 MB 美术（scope `all`）+ 12 MB 视频。可选：降到 `ui`（−30 MB）、或把 `public/assets` 迁 CDN / OSS。
- [ ] **观战席可见范围**：目前房间里所有人都能看到那个下拉；可改成「仅观战者可见」。
- [ ] **攻击前冲 / 浮空技能**（主线 v0.1.3 #61 / #23）已实现，**待实机验手感**。
- [ ] B 站宣传视频：见 §11 产物。
- [x] **CI 已接入**：`.github/workflows/ci.yml` 在 Ubuntu / Windows × Node 22 / 24 上跑 `npm ci`、`node --test` 和服务器冒烟测试。
- [x] **沙地战场官方的「高台」（局部抬升块）已实现**（2026-10-13）：官方战场 #01 的局部抬升台由 `public/js/render/board3d/theme.js` 的每主题 `platforms` 表 + `scene.js _buildPlatforms` 建成几何（**纯视觉**，`server/sim` 的格子 / 高度 / `deployTiles` 一律不变），见 [`docs/CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) §8.3，`test/render/board3d-scene.test.js` 钉住它。

## 10. 与主线的关系 / 下次怎么合并

- 主线：`https://github.com/sganggs/Stronghold-Protocol`。已合并 **v0.1.3**（§15）、**feedback5 / v0.2.0**（合并提交 `e3bd9de`，§33），并**选择性**并入 **feedback6** 与 **feedback7 R22 / R23**；本仓库版本 `0.4.0`。逐批完整记录（主线提交范围 / HEAD、取用的提交、跳过的提交与原因、冲突、golden 变动、本地提交）见 [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md)；**「永不合并」清单**也在其 §0。
- 合并方式（**选择性 cherry-pick**，不再只做大合并）：在临时 worktree 里按 `all-fb<N>.txt` 列出的主线提交逐个 triage（`OK` / `OKg` / `SKIP` + 原因），把 `OK` 的提交**保留作者与提交信息** cherry-pick 到 `ours` 并适配本分支；golden 先做**归属证明**再在专门提交里重算（[`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md)）；跑全量 `node --test` 后才推。大合并仍走 `git merge origin/master` + 逐块解冲突。
- 冲突高发文件：`server/lobby.js`、`server/net.js`、`server/match/Match.js`、`server/sim/*`、
  `shared/{constants,protocol}.js`、`public/js/{main,store}.js`、`public/js/screens/*`、`public/js/render/*`、
  `tools/build-data.mjs`（`CUSTOM_CHESS`）。
- **本批整体检查**（快照；以最新实测为准，见 §3）：测试 6129 项全绿、`kit-coverage` 307/307 · 120/120、
  `i18n en --strict` 1360/1360、`doctor` 退出码 0、`build-data --offline` 与 `data/` 逐字节一致、
  工作项目相对 store HEAD 无跟踪漂移。

## 11. 产物

- 文档：本文件、[`docs/MATCHMAKING.md`](MATCHMAKING.md)（决策记录）、[`docs/HANDOVER.md`](HANDOVER.md)（接手入口）、[`docs/QUERY-INDEX.md`](QUERY-INDEX.md)（查询索引）。
- 宣传片：`docs/promo/`（B 站宣传视频脚本 + 成片）。
- 发布：GitHub 主仓库 + Gitee 国内镜像（见 §5 发布一条与 [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md)）。
