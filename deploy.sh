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

echo "▶ build..."
export DATABASE_URL="${DATABASE_URL:-$(grep DATABASE_URL .env | cut -d= -f2- | tr -d '"')}"
npm run build

echo "▶ pm2 restart..."
pm2 restart valorant-dashboard 2>/dev/null || pm2 start npm --name "valorant-dashboard" -- start
pm2 save

echo "✅ 배포 완료"
