## 项目概述

凯艺销售 CRM — 基于 Next.js 15 App Router 的销售客户关系管理平台。支持四级角色（超级管理员/公司管理员/销售经理/销售）、多租户隔离、客户/联系人/商机/跟进/待办管理、AI 智能解析与洞察、知识库问答、通话录音转写、语音合成等功能。

## 技术栈

- **框架**: Next.js 15 App Router + TypeScript
- **样式**: Tailwind CSS 4
- **数据库**: PostgreSQL（pg 驱动）
- **对象存储**: S3 兼容（Coze Storage / AWS SDK）
- **运行时**: Node.js 24, pnpm
- **构建输出**: standalone 模式（Docker 部署）

## 目录结构

```
/workspace/projects/
├── app/                  # Next.js App Router 页面与 API
│   ├── (portal)/         # 主应用页面（登录后）
│   ├── api/              # API 路由
│   ├── login/            # 登录页
│   └── q/                # 公开页面（报价单等）
├── components/           # React 组件
│   ├── ai/               # AI 相关组件
│   ├── companies/        # 公司管理组件
│   ├── nav/              # 导航组件
│   ├── quotes/           # 报价单组件
│   ├── shared/           # 共享组件
│   ├── ui/               # 基础 UI 组件
│   └── voices/           # 语音相关组件
├── lib/                  # 服务端逻辑（数据库、AI、存储、权限等）
├── hooks/                # React Hooks
├── mobile/               # 移动端适配
├── public/               # 静态资源
├── scripts/              # 数据库迁移、种子数据、开发脚本
├── sql/                  # SQL 初始化脚本
├── testdata/             # 测试数据
├── tests/                # 测试文件
├── types/                # TypeScript 类型定义
├── docs/                 # 文档
├── middleware.ts          # Next.js 中间件（鉴权、CSP 等）
├── next.config.ts         # Next.js 配置
└── instrumentation.ts     # OpenTelemetry 埋点
```

## 关键入口 / 核心模块

- **页面入口**: `app/page.tsx` → `app/(portal)/` 主应用
- **API 路由**: `app/api/` 下按资源组织
- **数据库连接**: `lib/pool.ts`（pg Pool）、`lib/db.ts`
- **鉴权**: `lib/auth.ts`、`middleware.ts`
- **AI 集成**: `lib/ai.ts`、`lib/coze-knowledge.ts`、`lib/transcribe.ts`
- **存储**: `lib/storage.ts`（S3 兼容）
- **权限**: `lib/permissions.ts`、`lib/role-access.ts`
- **报价单**: `lib/quotes.ts`

## 运行与预览

- 开发启动: `pnpm dev`（端口 3001）
- 构建: `pnpm build`
- 生产启动: `pnpm start`（端口 3001）
- 数据库初始化: `pnpm db:init`
- 种子数据: `pnpm db:seed`

### 预览链路

- 判定为 Web 预览型项目：核心结果是浏览器可访问的 CRM 界面，需通过常驻 dev server 交互验证
- 预览入口: `scripts/coze-preview-build.sh`（安装依赖）→ `scripts/coze-preview-run.sh`（启动 `next dev --hostname 0.0.0.0 --port 5000`）
- 根 `.coze` 的 `[dev]` 指向上述脚本，`[preview].preview_enable = "enabled"`
- 技术项目根目录与工作区根目录重合（`path = "."`），根 `.coze` 同时承担子项目 `.coze` 职责

### 部署链路

- 部署类型: service / web
- 部署入口: `.cozeproj/scripts/deploy_build.sh`（pnpm install + pnpm build）→ `.cozeproj/scripts/deploy_run.sh`（node .next/standalone/server.js，端口 5000）
- 根 `.coze` 的 `[deploy]` 指向上述脚本
- Next.js standalone 输出模式，部署时通过 `node server.js` 启动

## 用户偏好与长期约束

- 平台要求使用 pnpm（禁止 npm/yarn）
- Next.js standalone 输出模式
- 预览端口固定为 5000
- 部署使用 Docker（node:20-alpine）
- `pg` 包需标记为 serverExternalPackages（已在 next.config.ts 配置）

## 常见问题和预防

- 数据库连接依赖 `DATABASE_URL` 环境变量
- `CONFIG_ENCRYPTION_KEY` 用于公司配置加密，缺失时部分功能受限
- AI 功能需要配置 API Key（Coze / OpenAI 兼容）
- 无 Coze Storage 时回退到本地 `storage/` 目录
