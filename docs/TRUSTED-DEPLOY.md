# Trusted 插件生产部署基线

本文是 `trusted` / `trusted-force` 插件的**部署基线**，不是“绝对安全”的承诺。trusted 代码仍可能完全控制页面或服务进程；容器、权限和网络限制只是缩小爆炸半径。

默认建议：

- 普通插件：可以按 `docs/DEPLOY.md` 部署
- `trusted`：默认关闭；只有明确审查、pin 和隔离完成后才开启
- `trusted-force`：只用于隔离的测试环境，不用于公网

## 1. 先决条件

- `plugins/config.json` 对每个 trusted 插件写精确的 `trusted` lock SHA-256
- 插件目录只读挂载
- 不在公网 / 通配地址上直接开启 trusted
- 玩家必须逐个同意
- 有可回滚的备份和日志

## 2. Compose 基线

下面的例子假设：

- 镜像按 `Dockerfile` 构建，容器内用户是 `node`（uid 1000）
- `plugins/` 和 `public/assets/` 是只读挂载
- `var/` 是可写的持久目录（账号、统计、token、probe 缓存）
- 只监听本机回环，外层用反向代理/防火墙暴露需要的端口

```yaml
services:
  stronghold:
    build: .
    user: "1000:1000"
    read_only: true
    tmpfs:
      - /tmp:size=64m
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      SP_PLUGIN_SCRIPTS: "trusted"
      SP_SCRIPT_PROBE_CACHE: "/tmp/plugin-probes.json"
      # 只在明确需要时设置；公网默认不要 trusted-force
      # SP_PLUGINS: "host"
    volumes:
      - ./plugins:/app/plugins:ro
      - ./public/assets:/app/public/assets:ro
      - ./var:/app/var
    restart: unless-stopped
```

如果外层反向代理在本机，`TRUST_PROXY` 按 `docs/DEPLOY.md` 配置；不要让不可信来源伪造代理头。

## 3. 权限与文件系统

- `read_only: true`：根文件系统只读
- `/tmp` 用 tmpfs；probe 缓存不影响持久状态
- `var/` 是唯一需要写的应用目录
- `plugins/` 只读：运行中的脚本不能改自己的文件
- `public/assets/` 只读
- 不挂 Docker socket
- 不给 `CAP_SYS_ADMIN`、`CAP_NET_ADMIN` 等额外 capability
- 使用 rootless Docker / 用户命名空间（如果宿主机支持）

## 4. 网络

Compose 本身不提供完整的出站白名单。生产上建议：

- 只允许客户端访问反向代理端口
- 服务器出站只放行镜像/素材更新所需域名
- trusted 插件运行期间不需要外网；如无素材更新，可进一步收紧
- 不把管理端口 `/admin`、工作室 `/studio/` 直接暴露到公网

## 5. 启动检查

```bash
# 1. 锁和 pin 一致
node tools/plugin.mjs check <trusted-id> --strict
node tools/plugin.mjs pack <trusted-id>

# 2. 服务只能看到回环
docker compose config
docker compose up -d
docker compose logs --tail=100

# 3. 健康检查
curl -fsS http://127.0.0.1:3000/healthz

# 4. 容器基线检查（只检查已运行容器，不执行插件）
node tools/trusted-container-check.mjs --container <name>
# 或：npm run check:trusted -- --container <name>
# 检查非 root、只读 rootfs、cap_drop ALL、no-new-privileges、资源上限、非 host 网络、端口仅回环

# 4. 运营台确认
# /admin → 插件与内容 → trusted / probe / 房间 consent
```

## 6. 运行中

- `trusted` 插件更新后必须重新 pack、重新 pin；旧执行中的对局不会热替换
- 撤销 trusted：先停止房间/服务器，再改 pin 或关闭 `SP_PLUGIN_SCRIPTS`
- 不把玩家 consent 当成 owner pin 的替代
- 记录：插件 id、版本、lock hash、pin、同意时间、异常日志
- 任何异常先降级到 `SP_PLUGIN_SCRIPTS=off` 或空插件目录

## 7. 仍然存在的风险

- 原生 trusted 页面代码可以阻塞自己的页面
- 原生 trusted 服务代码可以占用 CPU/内存；watchdog 只能终止已知的长时间任务
- 容器不是沙箱内核；内核漏洞、Docker 配置错误仍可能逃逸
- 脚本回调的预算不能中断所有无限循环
- 反向代理、工作室和资产源也是攻击面

因此本基线只作为“最小生产隔离”，不能替代代码审查和 owner pin。
