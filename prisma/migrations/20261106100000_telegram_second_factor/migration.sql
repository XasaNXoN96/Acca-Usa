-- CreateTable
CREATE TABLE "TelegramLink" (
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "username" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLink_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "TelegramToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLink_chatId_key" ON "TelegramLink"("chatId");

-- CreateIndex
CREATE INDEX "TelegramToken_userId_purpose_createdAt_idx" ON "TelegramToken"("userId", "purpose", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramToken_purpose_secretHash_key" ON "TelegramToken"("purpose", "secretHash");

-- AddForeignKey
ALTER TABLE "TelegramLink" ADD CONSTRAINT "TelegramLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramToken" ADD CONSTRAINT "TelegramToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
