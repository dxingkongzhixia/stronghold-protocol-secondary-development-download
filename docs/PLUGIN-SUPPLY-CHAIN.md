# 插件安装与更新供应链

本页说明本分支现有的安装/更新安全边界和推荐流程。它不是代码签名方案；当前没有内置签名链。

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

- 内置代码签名 / 公钥验证
- 自动更新
- 安装历史 UI
- 从运营台远程写入插件文件

这些需要单独设计；当前的安全边界是“sha256 + zip/目录检查 + owner 本机安装 + 房间选择 + 脚本锁/信任门”。

## 6. 来源与审计

- 记录安装来源 URL、sha256、安装时间和操作者
- 运营台的策略写入会写 `var/admin-audit.log`
- 插件安装本身建议在服务器 owner 的 shell 里执行，并保留 shell 历史/变更记录
- 不要把陌生 zip 直接放进 `plugins/` 绕过安装检查
