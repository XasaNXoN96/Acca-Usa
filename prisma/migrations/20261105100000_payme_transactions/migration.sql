-- CreateTable
CREATE TABLE "PaymeTransaction" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "paymeTime" BIGINT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "state" INTEGER NOT NULL,
    "reason" INTEGER,
    "createTime" BIGINT NOT NULL,
    "performTime" BIGINT NOT NULL DEFAULT 0,
    "cancelTime" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymeTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymeTransaction_paymentId_state_idx" ON "PaymeTransaction"("paymentId", "state");

-- CreateIndex
CREATE INDEX "PaymeTransaction_paymeTime_idx" ON "PaymeTransaction"("paymeTime");

-- AddForeignKey
ALTER TABLE "PaymeTransaction" ADD CONSTRAINT "PaymeTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

