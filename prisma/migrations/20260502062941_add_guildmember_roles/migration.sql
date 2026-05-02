-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GuildMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "roles" TEXT NOT NULL DEFAULT '',
    "nickname" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuildMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GuildMember_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GuildMember" ("guildId", "id", "joinedAt", "userId") SELECT "guildId", "id", "joinedAt", "userId" FROM "GuildMember";
DROP TABLE "GuildMember";
ALTER TABLE "new_GuildMember" RENAME TO "GuildMember";
CREATE UNIQUE INDEX "GuildMember_userId_guildId_key" ON "GuildMember"("userId", "guildId");
CREATE TABLE "new_MarketPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER,
    "category" TEXT NOT NULL DEFAULT '기타',
    "status" TEXT NOT NULL DEFAULT 'sale',
    "imageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MarketPost_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MarketPost" ("category", "createdAt", "description", "guildId", "id", "imageUrl", "price", "status", "title", "updatedAt", "userId") SELECT "category", "createdAt", "description", "guildId", "id", "imageUrl", "price", "status", "title", "updatedAt", "userId" FROM "MarketPost";
DROP TABLE "MarketPost";
ALTER TABLE "new_MarketPost" RENAME TO "MarketPost";
CREATE INDEX "MarketPost_guildId_status_idx" ON "MarketPost"("guildId", "status");
CREATE TABLE "new_MemberApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "riotId" TEXT NOT NULL,
    "mainAgent" TEXT NOT NULL,
    "playtime" TEXT NOT NULL,
    "motivation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MemberApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MemberApplication_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MemberApplication" ("createdAt", "guildId", "id", "mainAgent", "motivation", "playtime", "reviewNote", "reviewedBy", "riotId", "status", "updatedAt", "userId") SELECT "createdAt", "guildId", "id", "mainAgent", "motivation", "playtime", "reviewNote", "reviewedBy", "riotId", "status", "updatedAt", "userId" FROM "MemberApplication";
DROP TABLE "MemberApplication";
ALTER TABLE "new_MemberApplication" RENAME TO "MemberApplication";
CREATE INDEX "MemberApplication_guildId_status_idx" ON "MemberApplication"("guildId", "status");
CREATE UNIQUE INDEX "MemberApplication_userId_guildId_key" ON "MemberApplication"("userId", "guildId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
