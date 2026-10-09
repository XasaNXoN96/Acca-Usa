-- CreateTable
CREATE TABLE "MaterialNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pdfPage" INTEGER,
    "videoSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialNote_userId_materialId_createdAt_idx" ON "MaterialNote"("userId", "materialId", "createdAt");

-- CreateIndex
CREATE INDEX "MaterialNote_userId_updatedAt_idx" ON "MaterialNote"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "MaterialNote" ADD CONSTRAINT "MaterialNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialNote" ADD CONSTRAINT "MaterialNote_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

