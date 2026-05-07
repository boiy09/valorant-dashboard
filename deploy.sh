#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "▶ git pull..."
git fetch origin master
git reset --hard origin/master

echo "▶ dependencies..."
npm ci --prefer-offline 2>/dev/null || npm install

echo "▶ prisma generate..."
npx prisma generate

echo "▶ database env..."
export DATABASE_URL="${DATABASE_URL:-$(grep DATABASE_URL .env | cut -d= -f2- | tr -d '"')}"

echo "▶ stop unused web process..."
pm2 delete valorant-dashboard 2>/dev/null || true

echo "▶ pm2 restart bot..."
pm2 restart valorant-bot --update-env 2>/dev/null || pm2 start npm --name "valorant-bot" -- run bot
pm2 save

echo "✅ 배포 완료"
