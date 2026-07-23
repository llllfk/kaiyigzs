## 项目概述

凯艺销售 CRM — 基于 Next.js 15 App Router 的销售客户关系管理平台。支持四级角色（超级管理员/公司管理员/销售经理/销售）、多租户隔离、客户/联系人/商机/跟进/待办管理、AI 智能解析与洞察、知识库问答、通话录音转写、语音合成等功能。

## 技术栈

- **框架**: Next.js 15 App Router + TypeScript
- **样式**: Tailwind CSS 4
- **数据库**: PostgreSQL（pg 驱动）
- **对象存储**: S3 兼容（Coze Storage / AWS SDK）
- **运行时**: Node.js 24, **pnpm**（禁止 npm/yarn 作为平台安装方式）
- **构建输出**: 普通 `next build` + `next start`（**不要** `output: "standalone"`，避免 Coze 上 `/_next/static` 404）

## 目录结构

```
/workspace/projects/
├── app/                  # Next.js App Router 页面与 API
│   ├── (portal)/         # 主应用页面（登录后）
│   ├── api/              # API 路由
│   ├── login/            # 登录页
│   └── q/                # 公开页面（报价单等）
├── components/           # React 组件
├── lib/                  # 服务端逻辑
├── public/               # 静态资源
├── scripts/              # 预览/迁移/种子脚本
│   ├── coze-preview-build.sh
│   └── coze-preview-run.sh   # next dev 0.0.0.0:5000
├── .cozeproj/scripts/    # 部署构建/启动
│   ├── deploy_build.sh   # pnpm install + pnpm build
│   └── deploy_run.sh     # next start 0.0.0.0:5000
├── sql/                  # schema
├── docs/                 # 含 Coze 部署说明与导入核对清单
├── .coze                 # Coze 预览/部署入口
├── middleware.ts
├── next.config.ts        # 无 standalone；含 CSP
└── package.json          # dev/start 端口 5000
```

## 关键入口 / 核心模块

- **页面入口**: `app/page.tsx` → `app/(portal)/` 主应用
- **API 路由**: `app/api/` 下按资源组织
- **数据库**: `lib/db.ts` / `lib/pool.ts`（`DATABASE_URL`）
- **鉴权**: `lib/auth.ts`（Session Cookie + 数据库）、`middleware.ts`（Origin 校验）
- **AI / 存储**: `lib/ai.ts`、`lib/storage.ts`

## 运行与预览（Coze）

- 开发/预览端口固定 **5000**，监听 **0.0.0.0**
- 本地也可：`pnpm dev` → `http://localhost:5000`
- 构建：`pnpm build`；生产：`pnpm start`（或部署脚本）

### 预览链路

- Web 预览型：常驻 `next dev`
- `.coze` → `[dev].build` = `scripts/coze-preview-build.sh`，`[dev].run` = `scripts/coze-preview-run.sh`
- `[preview].preview_enable = "enabled"`，`[subprojects].path = ["."]`

### 部署链路

- `[deploy].build` = `.cozeproj/scripts/deploy_build.sh`（`pnpm install` + `pnpm build`）
- `[deploy].run` = `.cozeproj/scripts/deploy_run.sh`（`npx next start -p 5000 -H 0.0.0.0`）
- **禁止**再改回 `node .next/standalone/server.js`（除非构建后拷贝 `.next/static`）

## 用户偏好与长期约束

- 平台使用 **pnpm**
- **不要**启用 `output: "standalone"`（Coze 静态资源易 404 / MIME text/plain）
- 预览与部署端口 **5000**
- `pg` 已在 `serverExternalPackages`
- `.env.local` 不入库；生产环境变量在 Coze 控制台配置

## 生产环境变量（导入 Coze 后必配）

| 变量 | 要求 |
|------|------|
| `DATABASE_URL` | 须含 `sslmode=require` |
| `SESSION_SECRET` | ≥ 32 位 |
| `CONFIG_ENCRYPTION_KEY` | 32 字节 Base64 |
| `APP_ORIGINS` | 公网 Origin，如 `https://xxx.coze.site`（无末尾 `/`；可多域名逗号分隔） |
| `TRUST_PROXY` | `true` |

可选：`PUBLIC_APP_BASE_URL`、`DEV_DEMO_LOGIN` + `DEV_*_PASSWORD`、Coze/火山 AI 与 Storage 相关变量。

详见：`docs/Coze部署与静态资源说明.md`、`docs/GitHub导入Coze核对清单.md`

## 常见问题和预防

- CSS/JS `MIME text/plain` / 404 → 确认未使用 standalone，且用 `next start`/`next dev`
- 登录 403 `Invalid request origin` → 检查 `APP_ORIGINS` + `TRUST_PROXY`
- 整站 500 / instrumentation → 检查 `SESSION_SECRET` 等必填项
- 无 Coze Storage 时回退本地 `storage/`（生产勿依赖）
