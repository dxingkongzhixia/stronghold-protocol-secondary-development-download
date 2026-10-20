# 插件安装与更新供应链

本页说明本分支现有的安装/更新安全边界和推荐流程。商城上传已经支持可选的 Ed25519 签名（`var/plugin-market/keys.json`）；安装 CLI 仍只校验 SHA-256，签名验证目前是商城上传层的能力。

## 1. 安装入口

- `node tools/plugin.mjs install <zip>`
- `node tools/plugin.mjs install <https-url> --sha256 <hex>`
- Studio 的目录安装走同一套 `server/plugins/install.js`
- 安装后仍需 `check --strict` / room selection；安装本身不授予脚本执行权限

## 2. 强制校验

- **HTTPS 安装必须提供 `--sha256`**：下载的 zip 必须匹配
- **catalogue 条目**可带 `sha256` / `bytes` / id；安装时校验大小、hash 和 id
- **本地 zip** 的 `--sha256` 是可选的；生产环境建议总是提供
- 安装会先检查 zip 路径、符号链接、大小和插件清单，再写入 `plugins/`
- `--force` 会把旧目录移到 `_replaced/`，不会静默覆盖
- 安装失败会删除临时文件，不留下半安装目录

## 2.1 商城签名（Ed25519）

- 信任根：`var/plugin-market/keys.json`，owner 在后台「插件与内容 → 签名密钥」维护
- 上传头：`X-Plugin-Key-Id` + `X-Plugin-Signature`（base64 Ed25519，签原始 zip 字节）
- 未知/撤销 key、无效签名：商城拒绝上传
- 可配置 `requireSigned`：例如要求 `content` / `script` / `trusted` 必须签名
- 签名只证明来源和完整性；管理员测试、review、沙箱、consent 仍然必需
- **安装 CLI 还没有 `--signature` 校验**，它仍以 SHA-256 为准；这是下一步

## 3. 推荐流程

```bash
# 1. 下载后先在别的目录校验 hash
sha256sum plugin.zip

# 2. 安装时固定 hash
node tools/plugin.mjs install plugin.zip --sha256 <64-hex>

# 3. 检查
node tools/plugin.mjs check <id> --strict

# 4. 打包/锁
node tools/plugin.mjs pack <id>

# 5. 在测试服务器开一局，再考虑生产
```

HTTPS：

```bash
node tools/plugin.mjs install https://example.test/plugin.zip --sha256 <64-hex>
```

## 4. 更新

- 没有自动更新
- 更新前先备份 `plugins/<id>/` 和 `plugins/config.json`
- 更新后重新 `check --strict`、重新 `pack`，并让房间「重新应用」
- 脚本插件更新后锁会变；旧 pin 不再有效
- 不要用 `--force` 绕过检查；它只用于明确的回滚/替换

## 5. 目前没有的能力

- 安装 CLI 的内置签名验证（商城上传层已有 Ed25519）
- 自动更新
- 安装历史 UI
- 从运营台远程写入插件文件：**现在已有安装/卸载 UI**，但仍是 owner token 明确操作，且旧目录移到 `_replaced/` / `_removed/`

当前安装安全边界是“SHA-256 + zip/目录检查 + owner 本机/后台安装 + 房间选择 + 脚本锁/信任门”；商城另有 Ed25519 上传签名。

## 6. 来源与审计

- 记录安装来源 URL、sha256、安装时间和操作者
- 运营台的策略、商城、审核、安装/卸载会写 `var/admin-audit.log`
- 插件安装建议在服务器 owner 的 shell 或 owner token 后台执行，并保留 shell 历史/变更记录
- 商城下载/镜像：`var/plugin-market/mirrors.json` + `tools/push-plugin-market.mjs`；中继优先，主服务器兜底
- 不要把陌生 zip 直接放进 `plugins/` 绕过安装检查
