ALTER TABLE "RiotAccount" ADD COLUMN "cachedTierId"   INTEGER;
ALTER TABLE "RiotAccount" ADD COLUMN "cachedTierName" TEXT;
ALTER TABLE "RiotAccount" ADD COLUMN "cachedLevel"    INTEGER;
ALTER TABLE "RiotAccount" ADD COLUMN "cachedCard"     TEXT;
ALTER TABLE "RiotAccount" ADD COLUMN "rankCachedAt"   TIMESTAMP(3);
