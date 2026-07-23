# GitHub → Coze 导入核对清单

对照《Coze项目代码结构规范》与本仓库当前配置，确保从 GitHub 导入后可预览/部署。

## 已对齐（可导入）

| 项 | 状态 |
|----|------|
| Next.js 15 App Router | ✅ |
| TypeScript + Tailwind 4 | ✅ |
| 无 Pages Router / 无 custom server | ✅ |
| `next.config.ts` **无** `output: "standalone"` | ✅（避免 `/_next/static` 404） |
| `.coze` 预览/部署脚本 | ✅ `coze-preview-*.sh` + `.cozeproj/scripts/deploy_*.sh` |
| 预览：`next dev -H 0.0.0.0 -p 5000` | ✅ |
| 部署：`pnpm build` + `next start -H 0.0.0.0 -p 5000` | ✅ |
| `package.json` 端口 5000 | ✅ |
| CSP 含 `lf-cdn.coze.cn` / `apm.volccdn.com` / `fonts.bytedance.com` / `unsafe-eval` | ✅ |
| 静态由 Next 本机提供（平台代理转发到容器 `:5000`） | ✅ 勿用缺 static 的 standalone |
| 包管理：平台脚本用 **pnpm**（有 `pnpm-lock.yaml`） | ✅ |
| `.env.local` 已 gitignore | ✅ |
| `AGENTS.md` 与脚本一致（无 standalone、端口 5000） | ✅ |

## 导入 Coze 后必须在控制台配置的环境变量

生产启动会校验（缺则 Internal Server Error）：

```text
DATABASE_URL=postgresql://...？sslmode=require
SESSION_SECRET=（≥32位随机串）
CONFIG_ENCRYPTION_KEY=（32字节 Base64）
APP_ORIGINS=https://你的域名.coze.site
TRUST_PROXY=true
```

建议：

```text
PUBLIC_APP_BASE_URL=https://你的域名.coze.site
```

测试账号（可选）：

```text
DEV_DEMO_LOGIN=true
DEV_ADMIN_PASSWORD=...
DEV_COMPANY_PASSWORD=...
DEV_MANAGER_PASSWORD=...
DEV_SALES_PASSWORD=...
```

数据库需已执行 `pnpm db:init`（或等价初始化）并指向上述 `DATABASE_URL`。

## 与官方规范的差异（已知、可接受）

| 规范原文 | 本仓库 | 说明 |
|----------|--------|------|
| 包管理写 npm | 实际用 **pnpm** | `.coze` / 部署脚本已按 pnpm；勿改回 npm install |
| 端口写 3000 | 固定 **5000** | 匹配 `*-5000.dev.coze.site` |
| next.config「无需特殊配置」 | 有 CSP / serverExternalPackages | Coze 预览需要 CDN 白名单；`pg` 必须外置 |
| 内置 PG | 可用平台库或外挂腾讯云 | 外挂时务必 `sslmode=require` + 安全组放行 |

## 上传 GitHub 前建议

1. **不要**提交 `.env.local`
2. 确认已 push：`.coze`、`scripts/coze-preview-*.sh`、`.cozeproj/scripts/*`、无 standalone 的 `next.config.ts`、`AGENTS.md`
3. 可选删除或忽略 `package-lock.json`，避免与 `pnpm-lock.yaml` 混用（Coze 脚本走 pnpm）

## 导入后验收

1. 预览打开无 CSS/JS `MIME text/plain` / 404
2. `GET /_next/static/css/...` → 200
3. `POST /api/auth/login` → 200（非 403）
4. 能进入工作台

更细说明见：`docs/Coze部署与静态资源说明.md`
