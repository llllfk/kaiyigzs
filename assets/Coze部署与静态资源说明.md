# Coze 部署说明：开发 / 生产静态资源与环境变量

> 目的：确保开发预览（`*.dev.coze.site`）与生产域名（如 `kaiyicrm.coze.site`）都能正常加载 CSS/JS，并可登录使用。
> 依据：Coze《项目代码结构规范》——使用 Next.js App Router，`next build` + `next start`，**不要使用 `output: "standalone"`**。

---

## 一、强制结论

| 环境 | 正确启动方式 | 错误方式 |
|------|----------------|----------|
| 开发 / 沙箱预览 | `next dev -H 0.0.0.0 -p $PORT` | `standalone` 且未拷贝 static |
| 生产部署 | `next build` 后 `next start -H 0.0.0.0 -p $PORT` | 只跑 `node .next/standalone/server.js` 却没有 `.next/static` |

常见报错：

- `Refused to apply style ... MIME type ('text/plain')`
- `Refused to execute script ... MIME type ('text/plain')`

含义：`/_next/static/...` 实际是 **404/错误页（text/plain）**，不是真正的 CSS/JS。根因几乎都是 **静态目录未随运行环境提供**。

---

## 二、修改 `next.config.ts`

1. **删除** `output: "standalone"`（本项目若为 CloudBase/Docker 保留 standalone，则 Coze 部署必须改用不带 standalone 的配置，或构建后强制拷贝 static）。
2. CSP 需允许扣子相关脚本（各源之间必须有空格）：

```ts
import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://lf-cdn.coze.cn https://apm.volccdn.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  isProduction ? "upgrade-insecure-requests" : "",
]
  .filter(Boolean)
  .join("; ");

const nextConfig: NextConfig = {
  // 禁止：output: "standalone"  （Coze 上易导致 /_next/static 404）
  serverExternalPackages: ["pg", "pg-connection-string", "pg-pool", "pgpass"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), payment=(), usb=()",
          },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          ...(isProduction
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
```

说明：同源 `/_next/static` 走 `'self'` 即可；MIME `text/plain` 不是 CSP 拦样式，是文件未找到。

---

## 三、修改 `package.json` scripts

```json
{
  "scripts": {
    "dev": "next dev -H 0.0.0.0 -p 5000",
    "build": "next build",
    "start": "next start -H 0.0.0.0 -p 5000",
    "lint": "next lint"
  }
}
```

若平台注入 `PORT`，启动命令改为使用该端口，例如：

```bash
npx next dev -H 0.0.0.0 -p ${PORT:-5000}
npx next start -H 0.0.0.0 -p ${PORT:-5000}
```

`-H 0.0.0.0` 必须加，否则预览域名会「拒绝连接」。

本地 Windows 开发若需 3001，可另加脚本，例如 `"dev:local": "next dev -H 0.0.0.0 -p 3001"`。

---

## 四、Coze 启动命令建议

### 开发 / 预览沙箱

```bash
npm install
npm run dev
```

### 生产部署

```bash
npm install
npm run build
npm run start
```

**不要**使用：

```bash
cd .next/standalone && node server.js
```

除非构建后执行：

```bash
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
```

Coze 场景优先直接去掉 standalone。

---

## 五、生产环境变量（必填）

缺省会导致启动失败或整站 `Internal Server Error`（instrumentation 校验）：

| 变量 | 要求 |
|------|------|
| `DATABASE_URL` | 须含 `sslmode=require`（或更严） |
| `SESSION_SECRET` | ≥ 32 位随机字符 |
| `CONFIG_ENCRYPTION_KEY` | 32 字节 Base64 |
| `APP_ORIGINS` | 当前公网 Origin，如 `https://kaiyicrm.coze.site`（无末尾 `/`） |
| `TRUST_PROXY` | `true`（扣子反代必开） |

生成示例：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

可选：

| 变量 | 说明 |
|------|------|
| `PUBLIC_APP_BASE_URL` | 与公网域名一致 |
| `DEV_DEMO_LOGIN=true` | 登录页显示测试账号（需同时改代码去掉 production 禁用，并配置四个 `DEV_*_PASSWORD`） |

预览域名与生产域名不同时，`APP_ORIGINS` 写预览地址，或多个域名逗号分隔：

```text
APP_ORIGINS=https://kaiyicrm.coze.site,https://xxxx-5000.dev.coze.site
```

---

## 六、登录相关（中间件）

生产对 `POST /api/*` 校验 Origin：

- `APP_ORIGINS` 必须与浏览器地址栏一致
- `TRUST_PROXY=true`

否则登录返回 `403 Invalid request origin`。

若 Host 与 Origin 在代理下不一致，可暂时只校验 `APP_ORIGINS` 白名单（放宽 `originHost === requestHost`）。

---

## 七、测试账号（上线也要显示时）

文件：`app/api/dev/demo-accounts/route.ts`

将：

```ts
if (process.env.NODE_ENV === "production" || process.env.DEV_DEMO_LOGIN !== "true") {
```

改为：

```ts
if (process.env.DEV_DEMO_LOGIN !== "true") {
```

并配置：

```text
DEV_DEMO_LOGIN=true
DEV_ADMIN_PASSWORD=...
DEV_COMPANY_PASSWORD=...
DEV_MANAGER_PASSWORD=...
DEV_SALES_PASSWORD=...
```

密码须与库中账号一致。公网正式环境注意安全风险。

---

## 八、部署后验收清单

1. 打开首页，控制台无大量静态资源 MIME/`text/plain` 报错
2. 直接访问任一 CSS：`/_next/static/css/...` → **200**，类型含 `css`
3. 直接访问任一 JS：`/_next/static/chunks/...` → **200**，类型含 `javascript`
4. `POST /api/auth/login` → **200**（非 403）
5. 登录后可进 `/dashboard`

---

## 九、常见错误对照

| 现象 | 处理 |
|------|------|
| CSS/JS MIME `text/plain` / 404 | 去掉 standalone；用 `next start`/`next dev`；完整重新部署 |
| `SESSION_SECRET 至少需要 32 位` | 加长 `SESSION_SECRET` 并重启 |
| `Invalid request origin` | 配置 `APP_ORIGINS` + `TRUST_PROXY=true` |
| CSP 拦截 `lf-cdn.coze.cn` / `apm.volccdn.com` | `script-src` 加入对应域名，源之间加空格 |
| `demo-accounts` 404 | 代码去掉 production 限制 + `DEV_DEMO_LOGIN=true` |
| 登录「请求过于频繁」 | 登录限流封锁约 **15 分钟** |

---

## 十、给 Coze Agent 的一句话指令

请按本文修改项目：删除 `output: "standalone"`；使用 `next dev`/`next start` 监听 `0.0.0.0` 与平台端口；CSP 允许 `https://lf-cdn.coze.cn` 与 `https://apm.volccdn.com` 且 `'unsafe-inline'` 与 `'unsafe-eval'` 之间保留空格；生产配置 `DATABASE_URL`（含 sslmode）、`SESSION_SECRET`、`CONFIG_ENCRYPTION_KEY`、`APP_ORIGINS`、`TRUST_PROXY=true`；确保 `/_next/static` 在开发与生产均可 200 加载。

---

*文档用途：交给 Coze 编程 Agent / 部署配置对照。*
