# 插件商城（Plugin Market）

插件商城是一个独立的玩家页面，不是游戏内的插件面板：

- `/market/`：浏览、上传、下载
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

`GET /market/api/list` 同时返回 `installed`：游戏服务器 `plugins/` 目录里已加载、但尚未上架商城的插件。页面会把它们显示在「本机已安装」区，没有下载按钮。

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

审核不会把插件放进游戏服务器的 `plugins/`，也不会执行插件脚本。

## 下载

```http
GET /market/api/download/<ordinary|forge>/<id>
```

只有 `active` 可下载，返回 zip；每次下载计数加一。

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

## 边界

- 商城不是自动更新
- 管理员 `test` 会做结构和加载检查，但不等于完整玩法验收
- Forge 包仍受 `FORGE-COMPATIBILITY.md` 的部分转换边界限制
- trusted 插件仍需要 owner pin 和玩家 consent，下载/商城本身不授权执行
