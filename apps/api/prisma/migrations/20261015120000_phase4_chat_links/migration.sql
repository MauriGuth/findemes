-- CreateEnum
CREATE TYPE "ChatChannel" AS ENUM ('TELEGRAM', 'WHATSAPP');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "chatLinkCode" TEXT,
ADD COLUMN     "chatLinkCodeExpiresAt" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "ChatLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "ChatChannel" NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatLink_channel_externalId_key" ON "ChatLink"("channel", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatLink_userId_channel_key" ON "ChatLink"("userId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "User_chatLinkCode_key" ON "User"("chatLinkCode");

-- AddForeignKey
ALTER TABLE "ChatLink" ADD CONSTRAINT "ChatLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

