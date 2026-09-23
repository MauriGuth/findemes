-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "ingestTokenHash" TEXT,
ADD COLUMN     "ingestTokenIssuedAt" TIMESTAMPTZ,
ADD COLUMN     "lastIngestAt" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "ParserTemplate" ADD COLUMN     "confidence" DECIMAL(3,2) NOT NULL DEFAULT 0.95;

-- CreateTable
CREATE TABLE "LlmUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rawEventId" TEXT,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costMicros" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LlmUsage_userId_createdAt_idx" ON "LlmUsage"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Device_ingestTokenHash_key" ON "Device"("ingestTokenHash");

-- AddForeignKey
ALTER TABLE "LlmUsage" ADD CONSTRAINT "LlmUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

