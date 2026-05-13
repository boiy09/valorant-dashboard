-- ScrimSession: guildId + createdAt 복합 인덱스
CREATE INDEX IF NOT EXISTS "ScrimSession_guildId_createdAt_idx" ON "ScrimSession"("guildId", "createdAt");

-- Highlight: type + createdAt 복합 인덱스 (type 필터 조회 최적화)
CREATE INDEX IF NOT EXISTS "Highlight_type_createdAt_idx" ON "Highlight"("type", "createdAt");
