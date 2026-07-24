#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录（scripts/ 的上一级）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 显式声明关键环境变量，不依赖平台执行环境继承
export PORT=5000
export HOSTNAME=0.0.0.0

# 清理 5000 端口残留进程（绝不碰 9000）
fuser -k 5000/tcp 2>/dev/null || true
sleep 1

# 启动 Next.js 开发服务器，绑定 0.0.0.0:5000
exec pnpm exec next dev --hostname 0.0.0.0 --port 5000
