# 凯艺销售 CRM

Coze 兼容的 Next.js 15 销售客户关系管理平台（风格 A：专业深蓝 + 响应式 + 自定义控件）。

## 技术栈

- Next.js 15 App Router + TypeScript
- Tailwind CSS 4
- PostgreSQL（`DATABASE_URL`）
- S3 兼容对象存储（Coze Storage 环境变量）

## 本地启动

> 推荐使用本机 PostgreSQL，**不需要 Docker**。

### 1. 数据库（本机 PostgreSQL 16）

本仓库已配置为连接：

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/sales_crm
```

数据目录：`C:\Users\Administrator\pgdata-sales-crm`

启动 / 停止数据库：

```bat
scripts\pg-start.bat
scripts\pg-stop.bat
```

一键启动（若 PostgreSQL / 3001 端口已在运行会先关闭再启动）：

```bat
scripts\dev-start.bat
```

（内部调用 `scripts\dev-start.ps1`，控制台使用 UTF-8，避免中文乱码）

### 2. 应用

```bash
copy .env.local.example .env.local
npm install
npm run db:init
npm run dev
```

打开：http://localhost:3001

默认超管：手机号 `13800000001` / `Admin123!`（也可用邮箱 `admin@kaiyi.local`）

登录后可在「公司管理」创建公司并指定公司管理员。

### 3. 按公司绑定 AI 智能体

- **API Key**：全局共用，写在 `.env.local`
- **智能体 / 知识库**：每家公司单独配置，超管在 **公司管理 → AI 配置** 中填写

未绑定的公司会回退到系统默认配置（仅适合演示）。

## 已实现（P0）

- 四级角色：超级管理员 / 公司管理员 / 销售经理 / 销售
- 多租户 `company_id` 隔离与数据可见范围
- 客户 / 联系人 / 商机 / 跟进 / 待办
- 工作台仪表盘、团队账号、通知骨架、审计日志
- 自定义 Select / DatePicker / TimePicker / 滚动条
- 响应式壳（侧栏 / 抽屉 / 底栏）

## 已实现（P1）

- 通话录音上传（音频 + 转写文本）与微信聊天上传/粘贴
- AI 解析洞察，写入客户画像
- AI 自动生成跟进待办 + 通知
- 竞品自动抽取草稿（写入竞品库与提及记录）
- 知识库：管理员/经理建目录，全员上传下载
- 本地无 Coze Storage 时回退到 `storage/` 目录；无 AI Key 时使用启发式解析

## 已实现（P2）

- 知识库智能问答（按目录检索文本资料 + 引用来源）
- 商机 AI 阶段建议：一键采纳 / 忽略（写审计）
- 成交/流失复盘表单与原因分类
- 分析看板：漏斗、意向、行业/来源、痛点、竞品频次、复盘、上传状态、最近洞察
- 解析后自动写阶段建议到未关闭商机

## 后续（P3）

- 通知订阅细化、问答引用体验、图表打磨、移动端细节、审计筛选增强
