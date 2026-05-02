-- VoiceActivity: 음성 채널 활동 추적
CREATE TABLE "VoiceActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" DATETIME,
    "duration" INTEGER,
    CONSTRAINT "VoiceActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VoiceActivity_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "VoiceActivity_userId_guildId_idx" ON "VoiceActivity"("userId", "guildId");
CREATE INDEX "VoiceActivity_guildId_joinedAt_idx" ON "VoiceActivity"("guildId", "joinedAt");

-- DailyAttendance: 일별 출석
CREATE TABLE "DailyAttendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DailyAttendance_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DailyAttendance_userId_guildId_date_key" ON "DailyAttendance"("userId", "guildId", "date");
CREATE INDEX "DailyAttendance_guildId_date_idx" ON "DailyAttendance"("guildId", "date");

-- ScrimSession: 내전 세션
CREATE TABLE "ScrimSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '내전',
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "map" TEXT,
    "winnerId" TEXT,
    "createdBy" TEXT NOT NULL,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScrimSession_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ScrimPlayer: 내전 참가자
CREATE TABLE "ScrimPlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "kills" INTEGER,
    "deaths" INTEGER,
    "assists" INTEGER,
    CONSTRAINT "ScrimPlayer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScrimSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScrimPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ScrimPlayer_sessionId_userId_key" ON "ScrimPlayer"("sessionId", "userId");

-- Announcement: 공지 시스템
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Announcement_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Announcement_guildId_createdAt_idx" ON "Announcement"("guildId", "createdAt");
