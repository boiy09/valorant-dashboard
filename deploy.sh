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
npm ci --prefer-offline 2>/dev/null || npm install

echo "[deploy] generating Prisma client..."
npx prisma generate
node scripts/link-prisma-client.cjs

echo "[deploy] stopping unused web process..."
pm2 delete valorant-dashboard 2>/dev/null || true

echo "[deploy] restarting bot..."
pm2 restart valorant-bot --update-env 2>/dev/null || pm2 start npm --name "valorant-bot" -- run bot
pm2 save

echo "[deploy] done"
