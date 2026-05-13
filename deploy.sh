#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "[deploy] git pull..."
git fetch origin master
git reset --hard origin/master

echo "[deploy] loading database env..."
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  export DATABASE_URL="$(grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"
fi

echo "[deploy] installing dependencies..."
npm ci --prefer-offline 2>/dev/null || npm install || (rm -rf node_modules && npm ci)

echo "[deploy] installing proxy dependencies..."
if [ -f proxy/package-lock.json ]; then
  (cd proxy && (npm ci --prefer-offline 2>/dev/null || npm install || (rm -rf node_modules && npm ci)))
elif [ -f proxy/package.json ]; then
  (cd proxy && (npm install || (rm -rf node_modules && npm install)))
fi

echo "[deploy] generating Prisma client..."
npx prisma generate
node scripts/link-prisma-client.cjs

echo "[deploy] stopping unused web process..."
pm2 delete valorant-dashboard 2>/dev/null || true

echo "[deploy] restarting bot..."
pm2 restart valorant-bot --update-env 2>/dev/null || pm2 start npm --name "valorant-bot" -- run bot

echo "[deploy] restarting proxy..."
pm2 restart proxy --update-env 2>/dev/null || pm2 start proxy/server.js --name "proxy"
pm2 save

echo "[deploy] checking bot health..."
pm2 describe valorant-bot >/dev/null
BOT_STATUS="$(pm2 jlist | node -e "let input=''; process.stdin.on('data', c => input += c); process.stdin.on('end', () => { const apps = JSON.parse(input || '[]'); const app = apps.find((item) => item.name === 'valorant-bot'); process.stdout.write(app?.pm2_env?.status || 'missing'); });")"
if [ "$BOT_STATUS" != "online" ]; then
  echo "[deploy] valorant-bot is not online: $BOT_STATUS"
  pm2 logs valorant-bot --lines 80 --nostream || true
  exit 1
fi

echo "[deploy] checking proxy health..."
pm2 describe proxy >/dev/null
PROXY_STATUS="$(pm2 jlist | node -e "let input=''; process.stdin.on('data', c => input += c); process.stdin.on('end', () => { const apps = JSON.parse(input || '[]'); const app = apps.find((item) => item.name === 'proxy'); process.stdout.write(app?.pm2_env?.status || 'missing'); });")"
if [ "$PROXY_STATUS" != "online" ]; then
  echo "[deploy] proxy is not online: $PROXY_STATUS"
  pm2 logs proxy --lines 80 --nostream || true
  exit 1
fi

echo "[deploy] done"
