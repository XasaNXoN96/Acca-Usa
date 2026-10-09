-- CreateTable
CREATE TABLE "MaterialVersion" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "kind" "MaterialKind" NOT NULL,
    "title" TEXT NOT NULL,
    "fileId" TEXT,
    "fileMime" TEXT,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "MaterialVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialVersion_materialId_createdAt_idx" ON "MaterialVersion"("materialId", "createdAt");

-- AddForeignKey
ALTER TABLE "MaterialVersion" ADD CONSTRAINT "MaterialVersion_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

