-- CreateEnum
CREATE TYPE "BillKind" AS ENUM ('CARD_STATEMENT', 'UTILITY', 'EDUCATION', 'HEALTH', 'TAX', 'SUBSCRIPTION', 'OTHER');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('PENDING', 'UNPAID', 'PAID', 'IGNORED');

-- CreateEnum
CREATE TYPE "BillOrigin" AS ENUM ('EMAIL', 'MANUAL');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "inboundToken" TEXT;

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "BillKind" NOT NULL,
    "issuer" TEXT NOT NULL,
    "issuerNorm" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "minimumAmount" DECIMAL(18,2),
    "currency" "Currency" NOT NULL DEFAULT 'ARS',
    "dueOn" DATE NOT NULL,
    "periodMonth" DATE,
    "status" "BillStatus" NOT NULL DEFAULT 'PENDING',
    "origin" "BillOrigin" NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "commitmentId" TEXT,
    "paidTransactionId" TEXT,
    "rawEventId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bill_paidTransactionId_key" ON "Bill"("paidTransactionId");

-- CreateIndex
CREATE INDEX "Bill_userId_dueOn_idx" ON "Bill"("userId", "dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_userId_fingerprint_key" ON "Bill"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "RawEvent_userId_channel_externalKey_idx" ON "RawEvent"("userId", "channel", "externalKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_inboundToken_key" ON "User"("inboundToken");

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_paidTransactionId_fkey" FOREIGN KEY ("paidTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_rawEventId_fkey" FOREIGN KEY ("rawEventId") REFERENCES "RawEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

