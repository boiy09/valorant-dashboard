CREATE TABLE "HighlightLike" (
    "id" TEXT NOT NULL,
    "highlightId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HighlightLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HighlightLike_highlightId_userId_key" ON "HighlightLike"("highlightId", "userId");
CREATE INDEX "HighlightLike_userId_idx" ON "HighlightLike"("userId");
