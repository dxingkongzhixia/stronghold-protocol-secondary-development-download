# 项目现状一览（PROJECT-STATE）

> 给「新会话 / 新接手的人」看的一页纸。**最后核对：2026-10-26**（台式机 `_merge-scratch` + 线上实测）。插件 / Forge / studio / 控制台见
> [`docs/PLUGINS.md`](PLUGINS.md) 与 [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §13.10。
> 文档入口（2026-10-25 重新梳理）：人类 [`DEVELOPER.md`](DEVELOPER.md)、AI [`AI-AGENT.md`](AI-AGENT.md)、
> 规则 [`RULES.md`](RULES.md)、插件 [`PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md)。
> 功能细节与每次改动的来龙去脉见 [`docs/MATCHMAKING.md`](MATCHMAKING.md)（§1–§49；**§49 = 2026-10-16 特效批次总览**）。
> 按问题查文档见 [`docs/QUERY-INDEX.md`](QUERY-INDEX.md)。

---

## 1. 这是什么

「卫戍协议：盟约」的非官方同人**网页联机复刻**：Node 服务器 + 浏览器客户端，1–4 人合作塔防。
基线是**主线项目**（`sganggs/Stronghold-Protocol`；已合并到 **feedback5**（含 **v0.2.0** + i18n，见
[`docs/MATCHMAKING.md`](MATCHMAKING.md) §33），选择性并入 **feedback6** 与 **feedback7 的 R22 / R23**
两批，并于 **2026-10-14 整支合并主线 v0.2.6**（`488db49f`，190 个冲突全解、门禁全绿）——完整记录见
[`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §11）。

本仓库是**基于主线开发的分支项目**，在主线之上独立维护：账号体系、野排匹配、公开同盟、在线状态与管理页、**观战 + 夺舍 AI**、
**大厅社区（更新日志 / bug提交 / 公开房间）**、启动体验与带宽治理、**8 名自造干员**（§4；
`tools/build-data.mjs` 的 `CUSTOM_CHESS`）、**GitHub 主仓库 + Gitee 国内镜像**。

## 2. 目录与「唯一真相」

**同一份仓库在 owner 的**两台机器**上，布局不同——先认自己在哪台：

- **笔记本（`masai`）**：**单仓库 / 单工作树** —— `D:\Git本地库\stronghold-protocol-secondary-development-download`，
  `.git` 在根目录，分支 `master`，远程 `github`（主）+ `gitee`（镜像）。`tools/push-gitee.mjs` 在这里同时充当
  store 与 dev tree。
- **台式机（`D:\DOTK`）**：**双树**，见下表。

**资源中转机**（`103.205.254.40`，ssh `-p 57435`）由 `tools/push-assets-relay.mjs` 部署，是**发布的第一步**。

**台式机的「双树」约定**（下表以此为准；在**笔记本**上请按 *store ↔ 当前检出*、*dev tree ↔ 当前检出*、*分支 `ours` ↔ `master`* 换算）：

| 路径 | 说明 |
|---|---|
| `Stronghold-Protocol\` | **工作项目 / 运行目录**：**没有 `.git`**，是 git 仓库的**逐字节镜像**（**不是**真源）。`node server/index.js` 在这里跑。 |
| `_merge-scratch\` | **唯一的 git 仓库 / 完整历史 / 唯一真相**（分支 `ours`）。提交、合并、推送都在这里；`node tools/push-gitee.mjs` 把 `HEAD` 推到所有远程，再把被跟踪文件镜像回工作项目。**单向：store → 远程 → 工作树**，绝不用工作树覆盖仓库（反向须显式 `--from-dev`）。 |
| `Stronghold-Protocol-github\` | 干净主线克隆（`master`）。 |
| `_optim-backup-*\` | 每次改动前的本地备份（名字含「日期-主题」）。 |

> ⚠️ store 里的 `.cache` / `public/assets` / `public/fonts` / `public/vendor` 是**指向工作项目的 junction**，约 600 MB 美术只有一份。**别单独删工作项目**，也别把 store 的 `public/assets` 当副本删掉。

## 3. 当前状态（2026-10-27 23:00 · 部署后实测）

| 项 | 值 |
|---|---|
| 版本 | `app 0.4.0`；**已上线进程的 build `ae49791767eb`**（2026-10-28 17:53 小修后重启：补传 `server/speed.js` 与 `achievements.css`，`/healthz` 实测且 == 磁盘 build；上一版 `4e11d39c1e3e`，17:10 的整批备份 `/root/sp-backup-20261028-170837.tgz`）。以 `/healthz` 的 `build` 为准（`BUILD_INPUTS` = `public/index.html` + `public/js` + `public/css` + `server/sim` + `shared` + `data` 的 size+mtime，**不含 `docs/`**；`build` 在进程内缓存，**只上传不重启会停在旧值** —— 两者不等就是还跑着旧代码，见 `docs/AI-WORKFLOW.md`） |
| 2026-10-28 17:10 上线批次 | ① **召唤物时装**（#876 的思路、自研）：`tokens[*].skins[<主人皮肤>]` + `UnitInfo.ownerCharId` + `skinOf`，**51 召唤物 / 72 套**（8.7 MB，`local-skins-tokens`）；② **#800** 结算「下一步」按钮按官方按钮面裁切；③ **#786** 朝上开技能、背面骨架没有该技能动作则转正面。相对 `459576478` **25 个文件**（增量包 0.41 MB）+ 新美术 4.8 MB；通知 4 人 → 备份 → 解包 → 重启 → 完成通知 3 人 |
| 2026-10-27 22:56 上线批次 | ① **技能音效补全**：从本地 CN 客户端抽出 **331 条**技能/攻击音效（`tools/local-extract/sfx.py`），含烛煌 S3 这类 `_s` 槽位；② **71 张新干员立绘**（`illust.py`，`data/assets.json` 的 `illust` 140 → 211）；③ **攻击收尾**：`MIN_ATTACK_TAIL = 0.15 s`，攻击窗口不再出现「一帧回 idle」；④ **内存优化**：content set 采纳后释放 builder 副本（`releaseContentSet`）、`MAX_KEPT` 12 → 6、`MAX_HOSTS` 6、`npm start` 加 `--max-old-space-size=512`。相对 `d62b97ad1` 共 **6 个提交 / 423 个文件**（增量包 9.07 MB / 0 删除） |
| 2026-10-27 17:02 上线批次 | ① **核心皮肤修复**：`tools/skins.mjs build` 把 `plugin.lock.json` 的动画片段写回 catalogue（缺 `anims` 时 `validSpine` 判无效、房间回退默认模型）；② **主线 0.3.2 战斗修正批 A 12 项**（#720 / #869 / #789 / #749 / #839 / #845 / #851 / #803 / #846 / #847 / #31 / #861）+ 对应 golden；③ 魔王「微尘」环绕光环（#576，纯显示）。相对上次部署 `fce35d298` 共 **34 个提交 / 63 个文件**（增量包 1.07 MB） |
| 2026-10-26 上线批次 | ① **插件组合上限** `4 → 12 → 128`（`plugins/config.json` 的 `limits.maxSets: 128`，策略天花板从 0–64 放到 0–128；代码默认 `DEFAULT_MAX_SETS = 32`、空闲缓存 `MAX_KEPT = 12`）—— 之前 4 个就是玩家看到的「插件已达上限」；② 房间加载插件卡顿：内容集文件校验改用浏览器原生 `crypto.subtle.digest`，纯 JS SHA-256 仅作回退；③ `server/speed.js` 的 `readOrigins` 按**位置**把第一个源标为「中继」（域名中继不再被误判为镜像）；④ 主界面模式选择三张卡改用官方纹理（`btn_single/btn_team/btn_match`）；⑤ 按键音关闭 |
| git store | **台式机** = `_merge-scratch`（分支 `prts-plugin`，HEAD 见 `git log`），开发树 `D:\DOTK\Stronghold-Protocol` 已镜像；本轮 HEAD `80a46958e` |
| 远程同步 | **已推送（2026-10-28）**：`github/master` == `gitee/master` == HEAD（`82d108f66` + 本次记录），**资源中继** `/srv/sp.git` 的 `master` = `82d108f66`（中继只服务 `public/`，文档提交不需要推；公网实测 relay 的 `/js/render/app.js` 200 且含 `ownerCharId`）。发布顺序照旧：中继 → github → gitee。GitHub 直连会失败，本机走 Steam++ 加速器（hosts 把 github 域名指到 `127.0.0.1`），Git 需 `http.schannelCheckRevoke=false`（已写进本仓库 local config，非仓库文件）。本机 `~/.ssh/sp-deploy.pub`（`sp-relay-deploy`）已于 2026-10-28 补进中继机 `authorized_keys`（原来只有台式机的 `sp-deploy@DESKTOP-QDB9ORN`），本机现在可直接推中继。游戏服仍只开 root 密码认证，密码由 owner 持有、不入库 |
| 全量测试 | **8527 项 / 8487 通过 / 0 失败 / 40 跳过，10.5 min**（2026-10-28 笔记本实测；召唤物时装之后。同一台机器此前 #800 + #786 后为 8521 / 8481 / 0 / 40；桌面机 2026-10-27 为 8519 / 8482 / 0 / 37，10.0 min）。`npm test` 固定 `--test-concurrency=4`（理由见 `AI-AGENT.md` §6）。注：`test/plugins/visualSet.test.js` 的「压缩缓存 ctime」用例在本机**偶发**失败（Windows 时间戳粒度，与代码无关；把改动 stash 后仍 4/5 失败） |
| 其它闸门 | **2026-10-26 台式机 store 复测**：`lint` 0 error（186 warning）✓；`typecheck` ✓；`i18n check en --strict` **1966/1966**（100%）✓；`build-data --offline` 不改 `data/`（2 条既有 warning）✓；docs 守卫 **35/35** ✓；kit 覆盖 **283/283** 技能、**112/112** 棋子 ✓；`check:imports` 3 条既有 `sim-node` 边界记录 |
| 本机环境 | Node **v24.19.0**（线上是 v26.10.0）；**系统 `python` 已是 3.12.10**（2026-10-28 升级：旧的 `C:\Program Files\python` 3.8.6 已从机器 PATH 移除、文件保留；`paramiko 5.1.0` / `UnityPy 1.25.4` 已装）；GitHub 经 Steam++（hosts → `127.0.0.1`），Git 需 `http.schannelCheckRevoke=false`；官方数据 CDN 需要代理 |
| 本地服务 | `npm start`（= `node --max-old-space-size=512 server/index.js`，2026-10-27 起；直接 `node server/index.js` 不设上限）于 `:3000`（`/healthz` 正常；`build` 为本地源码哈希，非线上 build）；`data/local-assets.json`（per-machine）已补齐 41 个 spine 组（棋子等本地模型恢复），`data/local-fx.json` 正常分发 |
| 线上新增内容 | 插件 **12** 个（含 `prts-kaltsit:loaded`，未改 `plugins/config.json` 默认列表）；主界面音乐 **218** 条（`var/music`，351 个文件）；内置音乐 24 条；剧情背景 **54** 张；DB schema **v6**；`var/avatars` 已创建 |

## 4. 线上

| 项 | 值 |
|---|---|
| 地址 | **https://strongholdprotocolcsym.top:10785/**（官方 HTTPS；NAT：内网 3000 → 外网 20522；旧的 `http://183.66.27.19:20522` 仍可访问，但会收到“改用官方地址”的普通通知） |
| 版本 | `app 0.4.0`；**已上线进程的 build `ae49791767eb`**（2026-10-28 17:53 小修后重启，由 `/healthz` 实测且 == 磁盘 build；上一版 `4e11d39c1e3e`；10-28 17:10 整批备份 `/root/sp-backup-20261028-170837.tgz`；社区更新日志 **0.4.75**，2026-10-27 23:05 由完成通知写入）；以 `/healthz` 的 `build` 为准（`BUILD_INPUTS` = `public/index.html` + `public/js` + `public/css` + `server/sim` + `shared` + `data` 的 size+mtime，**不含 `docs/`**；`build` 在进程内缓存，**只上传不重启会停在旧值** —— 两者不等就是还跑着旧代码，见 `docs/AI-WORKFLOW.md`） |
| 主机 | RainYun Debian KVM；SSH `root@183.66.27.19 -p 45217` |
| 面板 | 宝塔 `https://183.66.27.19:32467/rainy`（用户 `rainyun`） |
| 项目 | `/www/wwwroot/Stronghold-Protocol`，跑在 `www` 用户，`npm run start` |
| **资源中转** | **https://relay.strongholdprotocolcsym.top:56148**（宿迁云 KVM · Debian 12 · 4 GB RAM / 30 GB；ssh `-p 57435`，NAT 映射；**2026-10-26 从旧阿里云北京机 `123.57.150.185` 迁来**）：宝塔 nginx 服务 `/srv/sp/public`，裸仓库 `/srv/sp.git` + `post-receive` 钩子（**推即部署**，钩子同时安装 `tools/relay/sp-relay.nginx.conf` 到 `/www/server/panel/vhost/nginx/sp-relay.conf` 并 `nginx -t` 通过才 reload）。发布顺序：**先** `node tools/push-assets-relay.mjs`，**再** gitee/github。资源加载链：中转机 → GitHub 及其镜像 → 游戏服务器兜底。**缓存头（2026-10-15）**：带内容哈希的 URL（`~<hash>` 路径、客户端镜像前缀写出的 `?h=`）一年 `immutable`，普通路径与无扩展名路由（`/media`、`/scene`、`/clip`）一周（`map $arg_h`）——常客不再每周重下 135 MB 美术。接入与运维见 [`docs/ASSETS.md`](ASSETS.md)「The relay」 |
| **客户端缓存** | `public/index.html`、`public/js/**`、`public/css/**` 统一 `Cache-Control: no-store`（2026-10-23 起），保证部署后打开页面拿到新代码；`public/assets`、`public/fonts`、`public/vendor` 继续长期缓存。不要再给应用 JS/CSS 加 `?v=` 的 immutable 缓存。 |
| 管理页 | `/admin?token=<var/admin-token.txt>`（令牌 + 30 天 cookie）；公开只读 `/online/api` |
| 进程管理 | 宝塔「Node项目」脚本 `/www/server/nodejs/vhost/scripts/server.sh`（`setsid` 启动）；日志 `/www/wwwlogs/nodejs/server.log` |
| **域名 / 备案** | **官方 HTTPS 地址 `https://strongholdprotocolcsym.top:10785/` 已启用**（ICP **浙ICP备2026085059号-1**）；旧的 `http://183.66.27.19:20522` 仍可访问，但非官方地址会被提醒改用官方地址。域名/证书/HTTPS 的完整步骤保留在下面一行。 |
| **HTTPS / SW 的前置** | ① 域名 A 记录指向生产机；② 签证书并在反代上启用 HTTPS；③ **中继也必须 HTTPS** —— HTTPS 页面不允许明文 `http://` 子资源（mixed content），`http://123.57.150.185` 会被浏览器拦掉、客户端静默回退到免费 CDN；给中继一个子域名（如 `relay.strongholdprotocolcsym.top`）签证书，再把 `public/asset-mirrors.json` 的第一个源改成 `https://…`；④ 之后 SW 自动注册，`设置 → 美术资源缓存` 生效，用 `node tools/check-delivery.mjs --live` 核对 |
| **公安联网备案（2026-10-14 放弃）** | 已在「全国互联网安全管理服务平台」提交过（主体 马赛 + 网站 我的接口，曾处于待审核），随 owner「彻底不办备案」的决定一并放弃；数据码属敏感凭据、**不进仓库**。将来若重启备案，需要：域名 + 可访问的 HTTPS 站点 + 页脚公示号 |
| **备用 / 测试机（阿里云 ECS）** | **`121.43.140.85`**（华东1 杭州 · 2 vCPU / 2 GiB / 40 GiB **3 Mbps** · Alibaba Cloud Linux 3 + 宝塔面板）。2026-10-14 部署完成：代码 `/www/wwwroot/Stronghold-Protocol`（gitee 浅克隆，`git fetch --depth 1 origin master && git reset --hard origin/master` 更新）、Node `/www/server/nodejs/v26.10.0`、**systemd 服务 `stronghold`**（`User=www`、开机自启、崩溃自重启、日志 `/var/log/stronghold.log`）、监听 `:3000`；**本机 admin token 与旧机不同**（`var/admin-token.txt`）。**定位：备用 / 测试机，不承担生产** —— owner 2026-10-14 决定**不做域名与 HTTPS**（本地缓存 + 中继那套在纯 HTTP 下已够用），生产仍留在雨云那台（上行 20 Mbps，比本机 3 Mbps 更适合对外）。阿里云**安全组未放行 80/443/3000**，外部只能经临时隧道看（`cftunnel` 服务，quick-tunnel 地址随机、重启会变；`systemctl stop cftunnel` 即可撤）。上面的「域名与 HTTPS」步骤保留备用 |

**部署流程（当前做法）**
1. 本地 `node --test` 全绿；
2. 打包（不带超大 / 本机文件）：
   ```
   tar -czf sp-full.tgz --exclude=./.git --exclude=./node_modules --exclude=./public/assets --exclude=./public/vendor \
     --exclude=./public/fonts --exclude=./.cache --exclude=./var --exclude=./logs \
     --exclude=./test/e2e/out --exclude=./data/local-assets.json .
   ```
   ⚠️ **笔记本（单树）必须加 `--exclude=./.git`**：单树检出的 `.git` 里打包着美术资源，约 **700 MB**，
   漏掉这一项会打出 **705 MB** 的包（正常约 12 MB）。桌面机的开发树没有 `.git`，所以原命令没写它。
3. `scp` 到 `/root/sp-full.tgz`；服务器解包 → `chown -R www:www .` → 目录 755 / 文件 644；
   ⚠️ **2026-10-27 实测**：盒上的 `tar` 不认 `--owner=www --group=www`（解出来仍是 `root:root`、文件 664）——
   增量解包后要按包内清单 `chown www:www "$p"`，再按 `[ -d ]` 分 755 / 644，然后才重启。
4. 停旧进程（按 `ss -ltnp` 里 `:3000` 的 pid，`kill -TERM`）→
   `su -s /bin/bash www -c 'setsid /www/server/nodejs/vhost/scripts/server.sh'`；
5. `curl http://127.0.0.1:3000/healthz` + 外网 `/healthz` 验证；
   ⚠️ **确认进程真的换成了新代码**：盒上
   `node -e "import('/www/wwwroot/Stronghold-Protocol/server/http/buildTag.js').then(m=>console.log(m.computeBuildTag()))"`
   的结果必须**等于** `/healthz` 的 `build`。`buildTag()` 在进程内**缓存**（`server/http/buildTag.js`），
   所以**只上传、不重启**的部署会让进程继续按旧代码跑、`build` 也停在旧值 —— **两者不等就是"跑着旧代码"**，
   重启即可。（2026-10-15 实测：进程 10-14 12:12 启动、盒上文件 10-15 00:30 被换，`build` 停在 `eb29e3ee0a28`
   而磁盘已是 `47c37209549a`；重启后一致。）

> **先推通知、再上传 / 重启**：发布前先在 `/admin` 的「通知」面板推一条告示（署名 `d星空之下`），说清更新内容、大约多久、请刷新。**没有 owner 明确许可，不要部署**（默认「先不上线」）。
> **客户端改完刷新即可**（`/js`、`/css` 是 `no-store`，图片、字体和 `/vendor` 仍长缓存；build 变了开着的老页面会自动重载）。
> ⚠️ **`SP_VERIFY=sample` 只在 Windows 的 `server-start.cmd` 里设**，Linux 上没设 → 线上**服务端抽检复算 = off**。
> ⚠️ 打包必须用 git blob（`git show`）**按字节**落盘：PowerShell 的 `Set-Content -Encoding utf8` 会加 **BOM**，`i18n/*.json` 直接解析失败。

### 最近部署（倒序）

| 时间 | 代码 | build | 更新日志 | 要点 |
|---|---|---|---|---|
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
| 中继静态缓存 | 同游戏机口径：带内容哈希的 URL（`~<hash>` 路径 / `?h=` 查询）1 年 `immutable`，普通路径与 `/media`、`/scene`、`/clip` 路由 7 天（随推送由 relay 的 hook 安装并 `nginx -t`） | `tools/relay/sp-relay.nginx.conf` |
| 干员默认潜能 / 练度 | **`1` / 未精英化**（2026-10-15 owner 决定，官方对「未持有」干员的基准；数据仍在满潜构建，按 `potDown` 向下组合；可在「干员调配」里逐名调高。改动前是满潜 6 / 精英2 Lv.60） | `shared/potential.js`（`POTENTIAL_DEFAULT` / `CULTIVATE_DEFAULT`） |
| `SP_ASSET_RATE_KBPS` | `1200`（服务器兜底素材下载限速 ≈1.2 MB/s；0 关闭） | `server/http/files.js` |
| `SP_ASSET_REF` | 未设（**空串＝关闭来源层**：客户端直接走游戏机。不再用来钉 CDN 的 git ref —— ref 就写在 `public/asset-mirrors.json` 的 URL 里） | `server/assetindex.js` |
| `SP_ASSET_RELAY` | 未设（未设时取 `public/asset-mirrors.json` 里 `fullSources` 的第一个源；**已无写死的中继 IP**，配置里没有来源就是没有）——客户端**素材链的第一源**，也由 `/asset-index.json` 的 `sources` 交给 Service Worker | `server/assetindex.js` |
| `RELAY_MIN_BPS` / `MIRROR_MIN_BPS` | `0.4 MB/s` / `0.8 MB/s`（**按实测速度选源，中继仍是第一优先**：用**六张立绘并行**测总吞吐——先测中继，不达标才并行测其余；测量复用 2 分钟，`cacheMs: 0` 可强制每次重测。2026-10-27 由 1.2 / 0.5 调整：小样本会误杀实际大文件能跑 1.5–1.8 MB/s 的中继，也会把探测快但真实文件慢的镜像选上） | `public/js/assetMirror.js` |

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
# 发布（owner 规定顺序）：① 资源中转机 ② github 主仓 + gitee 镜像
node tools/push-assets-relay.mjs                      # = npm run push:relay；推即部署 123.57.150.185
node tools/push-gitee.mjs -m "本次改了什么"
# 两个常备检查
node tools/check-upstream.mjs                         # 主线有没有新提交 / 会冲突哪些文件 / 是否碰到 never-merge
node tools/check-delivery.mjs --live                  # 加载链顺序 + 缓存优先（浏览器自报 fromCache）
```

## 8. 备份 / 回滚

- **服务器**：`/root/sp-backup-*.tgz`（每次部署前打包 `server shared public docs [data]`）。回滚 = 解回项目 → 重新部署并重启。
- **本地**：`D:\DOTK\_optim-backup-<日期>-<主题>\`。
- **git 回退点**：tag `backup/pre-3d-scenes`、`backup-pre-groupA`，分支 `backup/ours-pre-reconcile-20261013`（见 [`docs/HANDOVER.md`](HANDOVER.md)）。

## 9. 已知问题 / 待办

**2026-10-27 音效与立绘：从国服客户端补齐（已改，未上线）**

- **症状**：部分干员（尤其新干员）技能期间没有对应音效 —— 烛煌 S3「众恶的焚场」（弹药类）只有开技能那声通用
  `b_char_atkboost`，技能期间的枪声/命中声一次不响。
- **原因**：客户端放技能期间攻击/命中音用的是清单里的 `audio.sfx.units[干员].attacks[技能槽]` / `hits[技能槽]`
  （`public/js/audio.js` 的 `unit()`），而发布的 `data/assets.json` 里**只有 1 个单位有 `attacks`、0 个有 `hits`**：
  生成器（`tools/assets/plan.mjs` 的 `pickModeAttacks/pickModeHits`）本来能给出 351 个，但对应 mp3 不在镜像里 →
  `fetch-assets` 把 leaf 丢掉了。烛煌 S3 的官方音是 `p_skill_hcnsrfrsr` / `p_atk_hcnsrfr_s` / `p_imp_hcnsrfr_s`。
- **改法**：新增 `tools/local-extract/sfx.py`（从 B 站国服客户端的 `audio/sound_beta_2/{player,enemy}` 抽 AudioClip，
  ffmpeg 转 96 kbps mp3）与 `tools/local-extract/illust.py`（`chararts/<charId>.ab` 的立绘精灵 → 3:5 卡面 WebP）；
  实抽 **331 个音效 + 71 张立绘**，再 `fetch-assets --offline --allow-shrink` + `tools/fetch-stats-assets.mjs` 重建清单。
  结果：**84 个干员有 `attacks`、57 个有 `hits`**（此前 1 / 0），`chars[].illust` 211 张；敌方仍有 **49 个音效**国服
  客户端也没有（敌方技能音，不影响干员）。详见 [`ASSETS.md`](ASSETS.md) 的「本地客户端来源」。
- **动画（未做）**：主人 2026-10-27 报告的「目标被打死后攻击动画直接回落、一卡一卡」还需要一个具体复现（哪个干员、
  普攻还是技能、目标是被别人打死还是走出范围）——现有 `_predictWindUp` 的预测起手在没等到 `atk` 时会走完 begin+loop
  再淡回（0.15 s 混合），与官方「动画走完才离开攻击状态」一致，所以症状可能来自别的路径（形态切换 / end clip）。

**2026-10-27 内存：插件内容集缓存（已改，未上线）**

- **症状**：线上主进程 17 人时 **1.03 GB**（部署后约 400 MB，一路涨到 1 GB 才平稳），另有 3 个比赛 host 子进程
  110–180 MB，整机 2.2 GB / 3.9 GB。
- **原因**：玩家每换一次插件组合就构建一份**内容集**（整份打过补丁的数据，≈16 MB 的 Buffers + ≈5 MB 堆上对象），
  而三处都在留：`contentSet.js` 构建器缓存 **32** 份、`contentSets.js` 的 `MAX_KEPT` **12** 份（房间不再用时仍留着
  服务 `/cs/` 下载）、`contentSetFiles` 另外**再复制**一份 body。日志实测本次重启 2 小时里有 **21 个不同组合**
  （一名玩家连续从 1 个插件加到 8 个），历史累计 210 个。
- **改法**（`docs/PLUGINS.md` §11 内存段）：构建器缓存 8 份，且 `contentSets` 接管后立刻 **`releaseContentSet`**
  丢掉构建器那份；`MAX_KEPT` 12 → **6**；`npm start` 加 `--max-old-space-size=512`；比赛 host 并发上限与
  `limits.maxSets` 解耦，改为 **`MAX_HOSTS = 6`**（此前 128，而每个 host 是独立进程）。
- **复现与实测**（同一套代码，40 个不同内容组合，`--expose-gc`）：RSS **855 → 520 MB**、堆 298 → 118 MB、
  ArrayBuffer 292 → 112 MB。`contentSetFiles` 的复制保留（防调用方改坏缓存，`test/plugins/contentSet.test.js` 断言）。
- **未做**：线上仍是旧代码，重启后才会生效（需发通知）。

**2026-10-27 核心皮肤：服务器已迁移，本机已拉取；存储已清理**

- **服务器已迁移**：`/www/wwwroot/Stronghold-Protocol/skins/sets/` 有 `local-skins` + `local-skins-2` + `local-skins-tokens`
  （304 MB + 8.7 MB），catalogue 为 **3 套 / 175 干员 / 277 套干员外观 / 51 召唤物 / 72 套召唤物时装**
  （329 可穿戴 / 20 仅图片）；逐文件校验 **2616 个 `/skins/…` 文件，0 missing**。
  `plugins/config.json` 的 `default` 是 `[]`，旧的 `local-skins*` 只在 `plugins/_replaced`（已清理）——**皮肤已是核心，不是插件**。
- **本机已拉取**：同一套 `skins/sets`（304 MB）已从服务器取回，catalogue 换成服务器版本；`node tools/skins.mjs check`
  为 **0 missing**，本地 `/skins/catalogue.json` 与 `/skins/sets/…` 都返回 200。
- **根因已定位并修复（2026-10-27）**：“房间里不按全局皮肤设置显示”既不是资源缺失，也不是插件来源，更不是
  `room.skins` / `skinOf` 链路 —— 是 `tools/skins.mjs build` 只搬了 `overlay.json` 的路径，**没把旧插件
  `plugin.lock.json` 里的动画片段（`anims` / 时长 / events / hits / bounds）写进 catalogue**。`validSpine`
  （`public/js/assets.js`）要求 `anims`，缺了就直接回退干员默认模型，表现就是“只认默认皮肤/不认选择”。
  本机复现：同一房间、同一条 `room.skins`，catalogue 无 clips 时 `actor.entry.skel` 指向 `/assets/~…`；
  `node tools/skins.mjs build` 重建后指向 `/skins/sets/local-skins/…`，`anims.idle = "Idle"`，spine 正常绘制。
  `check` 现在把“有模型但没 clips”单独计数并以退出码 1 报错。**2026-10-27 17:02 已随整批上线**（重启后
  `/healthz` build `b8f6defd0d1b`），线上 catalogue 1643346 B、`anims=true`，`/skins/…` 的 skel/atlas/webp 全 200。
- 链路本身已核对无误（`room.skins` → 座位 / `PlayerState.skins` → `m.public.players[].skins` + `UnitInfo.skin` →
  `render/app.js skinOf`）。若再复现，需要具体：干员 / 皮肤键、自己还是队友、`settings.otherSkins`、房间是否
  modded、浏览器里 `/skins/sets/…` 的请求与 `m.public.players[].skins`。
- **2026-10-27 存储清理**：30 GB 盘 **21 GB → 11 GB（18 GB free，39%）**。删除旧备份（保留 `sp-backup-20261026-233231`、
  `sp-backup-admin-docs-20261023-122942`、最新的 `sp-backup-code`）、promo/录屏素材、旧素材包、`/.Recycle_bin`、旧
  `_replaced`（保留 2 份最新）、旧宝塔 panel 备份、286 MB 的 `server.log`（截断）、apt cache。活动皮肤、插件、`public/`、`var/` 未动。

- **2026-10-27 主线盘点（全部暂缓）**：`node tools/check-upstream.mjs` 基线 `488db49f1` → 上游 tip `f07b89650`（0.3.3），
  **1102 个提交未并**（0.3.2 1096 + 0.3.3 6）。完整台账重写进 [`UPSTREAM-DEV-TRIAGE.md`](UPSTREAM-DEV-TRIAGE.md)：批 A 剩
  #729 + 敌方攻击回合（14–16）；结算内核 series #798/#802/#844/#855（`eb0c807b5` 一批，**不可拆**）；版本系统；9 个 UI 项
  （#792 #678 #800 #811 #820 #610 #790 #595 #691）；0.3.3 的 6 项。**暂缓的原因不是逐项取舍，而是支线与主线已明显分叉**
  （评估见该文档 §0.1：自同一基线 943 vs 1102 个提交、上游 1 636 个改动文件里 **1 005 个我们也改过**、
  内存合并 **447 个冲突文件**、结算内核 `eb0c807b5` 一次 294 文件），**是否继续追主线待 owner 评估**。
  #786（开技能转正面）已逐条分析（8 名干员 / 13 套皮肤命中、`?? 1` 暂停坑、1 个提交约 1–1.5 h），**本次不并**，
  结论与摘法留在该文档 §6。

**2026-10-25 代码健康维护（未上线，store `prts-plugin`）**

- `typecheck` 从 30 个错修到 0：`jsconfig.json` 缺 `DOM` lib（`shared/origins.js` 的 `new URL()`）、`shared/plugins/*` 的 `isObj` 没有类型谓词、`PluginEntry` 少 `builtin`、`scriptLoad.js` 的默认 fetch 用展开参数。CI 的 tooling job 此前一直在红。
- 跑全量时发现的两处 CSS 兼容性回归（守卫测试本就禁止，`feat(profile)` 引入）：`components.css` 的 `.account-modal__card:has(.profile)` 改成 `--profile` 修饰类；`.seat__artbtn` 补 `-webkit-backdrop-filter` 孪生声明。
- 两处过期测试期望跟上新增的 `lobbyMusic` 设置（`test/ui/gameLogic.test.js`、`test/feedback7-voices.test.js`）。
- 补位语料：`00cb38d02`（内置阵营加强插件）重排内容池后，`coop2-NORMAL-26-coverage-standins` 不再出补位 —— 保留为 `coop2-NORMAL-26-standins`，覆盖场景改用种子 4（`6_03_a → char_610_acfend`，与种子 14 的 `3_05_a` 不同）；`test/golden/matches.json` 按 `--family matches --update` 重新生成，未手改。
- `npm test` 固定 `--test-concurrency=4`：本机 16 核时默认并行会互相抢核，10.4 min 且稳定 4–6 个超时假失败；限到 4 后 7.6 min、0 失败。
- 已清理：`test/ui/issue602-deploy-fold*.test.js` 两个孤儿副本（2026-10-17 回退 #602 时从 git 删掉、镜像不删未跟踪文件所以留在项目本体；跑的 10 项里 5 项失败于 `deployFoldsShop is not a function`。内容仍可从 `f29d0333c` 取回）。
- 未处理：`build-data` 的 2 条既有 warning（`DIY_EXCLUDED_TEAMS` 空配置、`act1autochess_m01` 舞台名丢失研究注解）。

**2026-10-23 上线记录（已部署）**

- 本地分支 `master`（原 `prts-plugin` 批次已快进合入）；PRTS 修复代码 HEAD `2f350258f`，文档提交另计。
- **2026-10-23 已上线（PRTS 修复）**：生产 `/www/wwwroot/Stronghold-Protocol` 重启后 `build = 50c63310f468`，`/healthz` 200；`/admin`、`/admin/docs`、`/admin/api/docs`、`/js/adminDocs.js` 均 200；4 个插件加载。
- 本次发布通知：版本 `0.4.69`，签名 `d星空之下`，在线 11 人收到；备份：`/root/sp-backup-prts-20261023-152924.tgz`。
- **2026-10-23 早先上线（管理员文档链）**：`build = 43ea86680ef5`；发布通知 `0.4.67`，备份：`/root/sp-backup-admin-docs-20261023-122942.tgz`。
- 本批已包含：管理员文档链、PRTS「创伤小组」修复、0.3.2 战斗结束待机 / 特效清理、冷启动与重连自动恢复、手机横屏作战统计、结算页 #745、bond timer #746；Wild Mane #782 与 0.3.1 VFX 已在更早提交中。
- 2026-10-23 当日本机全量：**8348 tests / 8307 pass / 1 known performance flake / 40 skipped**；性能测试单跑通过。（后续基线见上面 2026-10-25 维护记录。）
- **PRTS「创伤小组」修复（已上线）**：team grant 包括 AI 队友；拿到凯尔希的队友不再在战斗开始额外生成 Touch 的预备医疗，且把凯尔希移出预备医疗格后也不会恢复 Touch 的预备医疗；策略效果 / 图鉴图标改用插件自带的凯尔希图标（`band_x_prts_source_code_touch`），不再沿用 `icon_amedic`。回归测试见 `test/match/prts-engine.test.js` 与 `test/content/prts-source-code.test.js`。
- **AI 机器人训练（2026-10-23）**：`var/training.db` 共 **11,296** 行（最近采样 15:19），v2 之后新增 **2,155** 行；夜间 `04:30/05:30` 的 `--auto` 多次因有活跃对局被跳过，因此手动用 `tools/train-bot.mjs` 发布 **v3**。v3 回测：**27,727** 候选样本、1,906 回测样本、top-1 **56.45%**、平均 regret **22.59**（v2 为 55.87% / 26.88），门槛通过；旧模型备份 `/root/botPrior-v2-20261023-160015.json`，发布报告 `var/training/report-2026-10-23.json`。`botPrior.js` 在下一次机器人备战时热加载，因此发布后 `/healthz` 在热加载前仍会显示 v2；操作细节见 `docs/DEPLOY.md`。
- **仍未修：** `public/js/screens/settle.js` 仍保留旧占位 `UnofficialMark = () => null` / `isModdedRoom = () => false`。改变玩法插件的对局在结算页不显示「非官方」，且 `levelProgress.counted` 会被当成官方对局；详见 `PLUGIN-BACKLOG.md` P2-6。
- 充能层数已接入 `server/sim/snapshot.js` 的 `charges` / `chargeView`，不再是“只有技力、没有层数”的旧状态。
- trusted 原生插件的生产隔离、安装 CLI 签名 / pin、跨浏览器插件 E2E、首屏素材带宽仍是既有未完成项。
- 旧记录（2026-10-20）如下，保留作对照：

**接手须知（2026-10-20 复核）**

- **全量测试用 `npm test`**（裸 `node --test` 会把 `test/fixtures/**/*.js` 也当测试）：
  - **台式机 store（本仓库，2026-10-20）**：**8194 项 / 8152 通过 / 0 失败 / 42 跳过**（`npm run ci` 六步全过；性能基线单跑 35/35）。
  - **笔记本（`masai` 单树，2026-10-16 夜，旧记录）**：**7081 / 7060 / 3 / 18**；3 个失败均为负载抖动（限速桶计时 + 重装 boss 性能阈值），单跑全绿。
  - 曾经的第 4 个失败 `test/render/token-wang-stone.test.js:48`（望的棋子模型）**已转绿**：那是该机 `data/local-assets.json`（per-machine）缺 `spine/token/*`，补回 41 个 spine 组即可；注意**服务端清单是 committed ∪ per-machine 的并集**，所以客户端其实一直能画官方棋子模型（详见 `docs/ASSETS.md`）。
  - **需要外网的门禁**：`check-delivery --live`（中继 / 镜像）与 `build-data --refresh`；台式机 store 的 `build-data --offline` 已通过（`data/` 零漂移）。
- **github 推送** 直连 `:443` 可能被重置，走本机代理 `127.0.0.1:31181`：`git -c http.proxy=http://127.0.0.1:31181 push --no-thin github HEAD:refs/heads/master`；gitee 与中转机不受影响。
- **中转机 root 密码** 曾用于开通，建议在阿里云面板重置（已装部署密钥 `~/.ssh/sp-deploy`，日常不需要密码）。
- **充能型技能的层数（2026-10-23 已修）**：`server/sim/snapshot.js` 的 `charges` / `chargeView` 已进入快照，客户端 `render/interp.js` 也读取；不再是“只有技力、没有层数”。
- **冷启动页面字节**（`public/js` + `data`，约 4–6 MB）仍由游戏机提供且不限速 —— 游戏机上目前唯一的带宽大头。

- [ ] **推送 / 上线今天的特效收尾**（15 个提交：官方特效的还原度修正、望 S3 每次 3 枚跟子、文档梳理）—— **等 owner 发话**（默认「先不上线」；这批没有美术文件，推送不必先走美术中继）。见 [`docs/MATCHMAKING.md`](MATCHMAKING.md) §49。
- [ ] **`SP_VERIFY` 在 Linux 上没开**（线上不抽检战斗结果）。要开：在宝塔的 `server.sh` 加 `export SP_VERIFY=sample`（面板重建脚本会覆盖，注意）。
- [ ] **首屏带宽**：新访客仍要下 ~104 MB 美术（scope `all`）+ 12 MB 视频。可选：降到 `ui`（−30 MB）、或把 `public/assets` 迁 CDN / OSS。
- [ ] **观战席可见范围**：目前房间里所有人都能看到那个下拉；可改成「仅观战者可见」。
- [ ] **攻击前冲 / 浮空技能**（主线 v0.1.3 #61 / #23）已实现，**待实机验手感**。
- [ ] B 站宣传视频：见 §11 产物。
- [x] **CI 已接入**：`.github/workflows/ci.yml` 在 Ubuntu / Windows × Node 22 / 24 上跑 `npm ci`、`node --test` 和服务器冒烟测试。
- [x] **3D 战场的「高台」与配色已定案（2026-10-14）**：官方的「高台」抬升块（`theme.platforms`，用普通 `MeshStandardMaterial` 拿不到场景的烘焙光、渲染成扁平的白板）与装置台的 `slab` 材质（把 act1 各图的装置台染成沙色）**都已关闭 / 回退**，装置台统一用程序化板材质（owner 指定 act2autochess_m02 为正确样本）；另外只给 act2autochess_m03 加了主题线性增益 `theme.gain`（按官方截图校准）。见 [`docs/CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) §8.2 / §8.5，`test/render/board3d-scene.test.js` 钉住它。

## 10. 与主线的关系 / 下次怎么合并

- 主线：`https://github.com/sganggs/Stronghold-Protocol`。已合并 **v0.1.3**（§15）、**feedback5 / v0.2.0**（合并提交 `e3bd9de`，§33），**选择性**并入 **feedback6** 与 **feedback7 R22 / R23**，并于 **2026-10-14 整支合并 v0.2.6**（`488db49f`，190 冲突全解、门禁全绿，见 §11）；本仓库版本 `0.4.0`。逐批完整记录（主线提交范围 / HEAD、取用的提交、跳过的提交与原因、冲突、golden 变动、本地提交）见 [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md)；**「永不合并」清单**也在其 §0。
- 合并方式（**选择性 cherry-pick**，不再只做大合并）：在临时 worktree 里按 `all-fb<N>.txt` 列出的主线提交逐个 triage（`OK` / `OKg` / `SKIP` + 原因），把 `OK` 的提交**保留作者与提交信息** cherry-pick 到 `ours` 并适配本分支；golden 先做**归属证明**再在专门提交里重算（[`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md)）；跑全量 `node --test` 后才推。大合并仍走 `git merge origin/master` + 逐块解冲突。
- 冲突高发文件：`server/lobby.js`、`server/net.js`、`server/match/Match.js`、`server/sim/*`、
  `shared/{constants,protocol}.js`、`public/js/{main,store}.js`、`public/js/screens/*`、`public/js/render/*`、
  `tools/build-data.mjs`（`CUSTOM_CHESS`）。
- **本批整体检查**（快照；以最新实测为准，见 §3）：测试 **7193 项 / 7178 通过 / 0 失败 / 15 跳过**、`kit-coverage` 307/307 · 120/120、`i18n en --strict` **1511/1511**、`doctor` 退出码 0、`eslint` 0 error、`typecheck` / `check:imports` 通过、`build-data --offline` 与 `data/` 逐字节一致、工作项目相对 store HEAD 无跟踪漂移。
  `i18n en --strict` 1455/1455、`doctor` 退出码 0、`eslint` 0 error（148 warning）、`typecheck` / `check:imports` 通过、
  `build-data --offline` 与 `data/` 逐字节一致、工作项目相对 store HEAD 无跟踪漂移。

## 10.1 已完成：插件栈整套迁移 / Worker 托管（`plugin-stack-tip`，2026-10-19 合入）

- **已合入 `ours`**（`2e37b1407`，由 gitee 拉取；分支 `plugin-stack-tip` 已作为祖先 `797481bf9` 并入）。里面是 tip 的整套插件栈：`server/plugins/**`、`shared/plugins/**`、`schemas/**`、`server/sim/content/dsl/**`、**studio**（`server/studio/**` + `shared/studio/**` + `public/studio/**`）、`public/js/render/vfx/plugin*`、`tools/plugin.mjs` + `tools/assets/official-tables.mjs`、`plugins/**`、`docs/PLUGIN-*`、`test/plugins/**` + `test/helpers/**`。
- **能力**：内容集（`cs`，`contentSets` 的 `get` / `dataBytes` / `scripts` / `offers` / `bounds`）、**match host（Worker 托管）**、W1–W5（主题变量 / 规则开关 / 新记录 / Forge 面板 / 特效借用）、Forge 真包导入、脚本沙箱（SES / `--permission`）、studio 战斗沙箱与 `/studio/` 工作台、`SP_TEST_MODE` 测试控制台、插件干员官方美术（发现 / 提取 / 本地合并）、`withModded` 统计开关。
- **本分支适配**（都保留）：插件 app 范围接受主线 0.3.x，但 content / script / trusted 仍严格；自定义干员 stand-in 跳过；8 个新插件拒绝码 + `ERR_TEXT`；官方 0.3.1 `op-*` 与自造干员共存（`diy.officialPool`）。
- **验收**（2026-10-19 本机拉取后实测）：`npm test` **8194 项 / 8151 通过 / 1 失败 / 42 跳过**，唯一失败是已知性能基线抖动（`test/sim/robustness` 单跑 **35/35**）；golden **20 + 11 + 129 场景全匹配**；`build-data --offline` 不改 `data/`；`/healthz` / `/plugins/index.json` / `/cs/` 全 200；文档门禁 34/34。
- **注意**：本机 `node_modules` 需 `npm install`（新增 `ses` 2.3.0）；`node --test` 裸跑会把 `test/fixtures/**/*.js` 当测试，统一用 `npm test`。
- **未做**：上线（默认「先不上线」，等 owner 明确许可）；0.3.1 / 0.3.2 的版本元数据不取（本分支保持 0.4.0）。

## 11. 产物

- 文档：本文件、[`docs/MATCHMAKING.md`](MATCHMAKING.md)（决策记录）、[`docs/HANDOVER.md`](HANDOVER.md)（接手入口）、[`docs/QUERY-INDEX.md`](QUERY-INDEX.md)（查询索引）。
- 宣传片：`docs/promo/`（B 站宣传视频脚本 + 成片）。
- 发布：GitHub 主仓库 + Gitee 国内镜像（见 §5 发布一条与 [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md)）。

## 12. 2026-10-20 上线记录

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
