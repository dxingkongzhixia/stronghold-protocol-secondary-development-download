# 插件商城（Plugin Market）

插件商城是一个独立的玩家页面，不是游戏内的插件面板：

- `/market/`：浏览、搜索、下载
- `/market/upload/`：单独的上传页面
- `/admin/api/market`：管理员审核（需要 `/admin` token）

## 存储

商城文件在：

```text
var/plugin-market/
├─ ordinary/       普通插件 zip
├─ forge/          Forge 包 zip
├─ index.json      元数据
└─ mirrors.json    可选下载镜像前缀列表
```

`var/` 是 git-ignored；商城上传不会写进 `plugins/`，也不会自动启用插件。

## 状态

- `pending`：玩家刚上传，未审核
- `active`：管理员测试通过，使用中，可下载
- `rejected`：管理员拒绝

只有 `active` 出现在公开列表和下载接口。

`GET /market/api/list` 同时返回 `installed`：游戏服务器 `plugins/` 目录里已加载、但尚未上架商城的插件。页面会把它们显示在「本机已安装」区，并可通过 `/market/api/installed/<id>/download` 下载服务器上的当前安装目录。

每个条目还带 `app`（声明的游戏版本范围）、`api`（插件 API level）和 `compat`（`ok` / `own` / `mainline` / `auto` / `unrestricted`），用于页面直接显示主线 0.3.x / 本服 0.4.x 的兼容性。

## 上传

```http
POST /market/api/upload?kind=ordinary|forge
Content-Type: application/zip
X-Plugin-Filename: my-plugin.zip
<zip bytes>
```

- 普通插件：zip 根目录或单层包装目录里必须有 `plugin.json`
- Forge：zip 根目录或单层包装目录里必须有 `pack.json`
- 大小上限沿用 `PLUGIN_LIMITS.pluginBytes`
- 上传者可以是登录账号，也可以是访客网络身份
- 重复的 `kind + id` 在 pending/active 时拒绝；rejected 可重新上传

## 管理员审核

`/market/?token=<admin-token>` 会显示审核区，或直接调用：

```http
GET  /admin/api/market?token=...
POST /admin/api/market?token=...
{ "kind": "ordinary", "id": "my-plugin", "action": "test" | "approve" | "reject", "note": "..." }
```

- `test`：在临时目录安装/导入并做真实检查，不改变状态
- `approve`：先 `test`，通过后变为 `active`
- `reject`：变为 `rejected`
- `edit`：修改 `description` / `author` / `app` / `api` / `listed` / `related`；只改商城元数据，不碰 zip 或插件代码
- `publish`：把 `plugins/<id>/` 打包为新的普通插件条目（`pending`），再由管理员测试 / 通过
- `move`：调整同类条目的展示顺序（`direction: up | down`）
- `rollback`：回滚到 `history` 中已审核过的版本（`{ version }`）
- `POST /admin/api/market/import?kind=ordinary|forge`：后台直接导入 zip，进入待审核状态

`related` 是其它插件 id 的列表（最多 16 个，不能含自己，必须存在于商城或本机插件中）。公开列表会解析为 `relatedPlugins`（名称 / 类型 / 状态）和 `relatedBy`（谁关联了本条），商城和后台都会显示。

### 依赖检查

商城从 manifest 读取 `requires` / `optional` / `conflicts`，并递归检查依赖链（最多 8 层）：

- 必需依赖缺失、版本不匹配、循环依赖或冲突时，`dependencyCheck.ok: false`
- `approve` 会拒绝 `ok: false` 的条目
- `optional` 缺失只进入 `optionalMissing`
- 后台抽屉和商城条目显示缺失/冲突的插件 id
- `related` 仍是展示关系，不参与依赖判断

### 版本与重新审核

已上架插件再次上传同 id 的新版本时，旧版本继续服务，新版本进入 `pendingUpdate`：

- 公开列表和下载仍使用当前 active 版本
- 管理员测试 / 通过后，旧版本进入 `history`（最多 10 个），新版本切换为 active
- 可以从 `history` 回滚
- 修改已上架条目的 `app` / `api` 会把 `needsReview` 置为 true：条目暂时从公开列表和下载接口移除，重新测试 / 通过后恢复
- 所有商城编辑、审核、移动、回滚和本机元数据修改都会写入 `var/admin-audit.log`

审核不会把插件放进游戏服务器的 `plugins/`，也不会执行插件脚本。

`/admin` 的「插件与内容 → 商城插件管理」直接编辑这些字段：描述、作者、`app` 兼容范围、API level 和「上架」开关。`listed: false` 的条目即使已通过审核也不会出现在公开列表或下载接口。

### AI 接管接口（预留）

```http
GET  /admin/api/plugins/ai?token=...
POST /admin/api/plugins/ai?token=...
```

`GET` 返回固定的能力声明（`reserved: true`、`executor: false`、可执行动作列表）；`POST` 在没有执行器时返回 **501**。唯一的只读例外是 `{ "dryRun": true, "action": "edit", ... }`：它只返回当前条目和提案字段，不做校验/写入，供 AI 或后台预览。这个接口和人类管理员共用 `/admin/api/market` 的 `admin-token` 边界；将来接入 AI 时必须由 owner 显式启用，AI 不能绕过测试 / 通过 / 上架流程。

### 签名（可选，Ed25519）

商城的信任根是 `var/plugin-market/keys.json`（owner 本机维护，不进仓库）：

```json
{
  "keys": [
    { "id": "owner-2026", "publicKey": "-----BEGIN PUBLIC KEY-----...", "label": "owner", "revokedAt": null }
  ]
}
```

上传时带：

```http
X-Plugin-Key-Id: owner-2026
X-Plugin-Signature: <base64 Ed25519 signature over the raw zip bytes>
```

- 签名验证通过：条目保存 `signature.verified: true`
- 未知/撤销 key、签名无效：上传被拒绝
- 未带签名：允许上传，但商城和后台显示「未签名」
- 签名只证明 zip 来源和完整性，不替代管理员测试、沙箱或 review
- 后台「诊断与内容 → 签名密钥」可添加/撤销公钥，并设置哪些 class 必须签名；信任根仍只由 owner 的 admin token 管理

### 后台安装 / 卸载

```http
POST /admin/api/plugins/install?token=...
Content-Type: application/zip
<zip bytes>

POST /admin/api/plugins/uninstall?token=...
{ "id": "plugin-id" }
```

安装/更新会把旧目录移到 `plugins/_replaced/`，卸载会移到 `plugins/_removed/`，不会直接删除；操作后刷新 registry。只允许拥有 admin token 的 owner 使用。

## 下载

```http
GET /market/api/download/<ordinary|forge>/<id>
```

只有 `active` 可下载，返回 zip；每次下载计数加一。
已安装但未上架的本机插件通过 `/market/api/installed/<id>/download` 按需打包下载；它们不计入商城下载数。第一次打包会按 `id-version-bytes` 缓存到 `var/plugin-market/installed/`，之后直接以流式 + HTTP Range 返回，支持断点续传和 HEAD。

公开上传有基础限流：同一网络/账号 10 分钟内最多 5 次成功提交；管理员后台导入不受此限制。所有商城写操作（编辑、审核、移动、回滚、本机元数据）写入 `var/admin-audit.log`。

### 不影响主服务带宽

公开列表返回 `sources`，来源是 `var/plugin-market/mirrors.json`：

```json
[
  "https://cdn.example.test/plugin-market/",
  "https://mirror.example.test/plugin-market/"
]
```

客户端优先按这些前缀请求同一路径（走和美术资源相同的 mirror/candidate 逻辑），全部失败才回落到游戏服务器。镜像需要由 owner 自行同步 `ordinary/`、`forge/` 文件。

## 安装

商城只负责分发 zip。玩家/owner 仍按正常流程安装：

```bash
node tools/plugin.mjs install <zip> --sha256 <hash>
node tools/plugin.mjs check <id> --strict
```

下载 zip 的 `sha256` 和大小在列表里可见，建议安装前核对。

## 页面

- 插件使用条形列表，不使用方块卡片
- 支持按名称 / 作者 / 描述 / 类型搜索
- **来源**分栏：普通插件（`plugin.json`）/ Forge 包（`pack.json`）/ 本机已安装
- **插件类型**筛选：外观 / 玩法 / 界面 / 脚本 / 信任 / 语言 / Forge 转换
- 每一条显示**本服 0.4.0** 与**主线 0.3.x** 两个独立的兼容标签，再附 `app` 范围 / `API` 版本
- 本机插件和没有镜像的插件使用浏览器原生下载链接；大文件不再先 `fetch` 成 blob 再保存
- 后台支持浅色 / 深色切换，以及直接导入 zip
- 支持调整同类条目的展示顺序；支持拖拽排序
- 关联插件在后台和商城都会显示
- 本机插件支持后台安装/更新 zip、卸载（旧目录移入 `_removed/`）
- 后台「诊断与内容」可查看 `var/admin-audit.log` 中的审计记录
- 支持清理未被引用的 zip 和本机下载缓存
- 公开上传显示进度条
- 商城条目可打开详情：描述、作者、兼容性、依赖、签名、关联、许可证、主页、SHA-256 和历史版本
- 上传是独立页面 `/market/upload/`
- 从标题页打开商城会使用新标签页；「返回游戏」优先关闭该标签页，避免重新加载游戏资源

## 兼容性

商城的兼容性分成两栏，不合并成一个结论：

| 标签 | 判断 |
|---|---|
| 本服 0.4.0 | `app` 范围是否包含 0.4.0 |
| 主线 0.3.x | `app` 范围是否包含 0.3.2（本分支兼容层使用的判定点） |

再看插件 class 决定「主线兼容」能不能直接用：

| 插件 class | 主线 0.3.x 兼容 | 本服 0.4.0 不兼容时的处理 |
|---|---|---|
| `lang` / `cosmetic` / `ui` | 是 | 自动按 0.3.x 兼容加载 |
| `content` / `script` / `trusted` | 是 | 仍严格；owner 需用 `allowIncompatible` 显式放行 |

Forge 包不直接按这两个标签下结论：页面显示「本服导入测试：已通过 / 待测试」和「主线：以导入结果为准」，最终看 `importForge` 的转换结果。

API 的 `compat` 字段保留 `own`（本服）、`mainline`（主线）、`auto`（class 是否自动兼容）、`unrestricted`（未声明 app）四个判断，页面不再把它们压成一个「兼容 / 不兼容」。

## 边界

- 商城不是自动更新
- 管理员 `test` 会做结构和加载检查，但不等于完整玩法验收
- Forge 包仍受 `FORGE-COMPATIBILITY.md` 的部分转换边界限制
- trusted 插件仍需要 owner pin 和玩家 consent，下载/商城本身不授权执行
