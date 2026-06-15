#!/bin/bash

# 设置环境变量
export NODE_ENV=production
export AUTH_ENABLED="${AUTH_ENABLED:-true}"

if [ -z "$AUTH_PASSWORD" ]; then
  echo "AUTH_PASSWORD is required. Set it in your shell or use Cloudflare Worker secrets."
  exit 1
fi

if [ -z "$COOKIE_SECRET" ]; then
  echo "COOKIE_SECRET is required. Generate one with: openssl rand -hex 32"
  exit 1
fi

# 创建会话目录并设置权限
mkdir -p sessions
chmod 700 sessions

# 启动应用
node --max-old-space-size=1024 app.js
