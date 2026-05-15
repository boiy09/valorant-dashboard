CREATE TABLE IF NOT EXISTS "AuctionBid" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "lotUserId" TEXT NOT NULL,
  "captainId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AuctionBid_sessionId_lotUserId_idx" ON "AuctionBid"("sessionId", "lotUserId");
CREATE INDEX IF NOT EXISTS "AuctionBid_sessionId_captainId_idx" ON "AuctionBid"("sessionId", "captainId");

CREATE TABLE IF NOT EXISTS "AuctionPick" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "captainId" TEXT NOT NULL,
  "team" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuctionPick_sessionId_userId_key" ON "AuctionPick"("sessionId", "userId");
CREATE INDEX IF NOT EXISTS "AuctionPick_sessionId_captainId_idx" ON "AuctionPick"("sessionId", "captainId");
