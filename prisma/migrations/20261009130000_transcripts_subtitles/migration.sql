-- CreateEnum
CREATE TYPE "TranscriptStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" "TranscriptStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL,
    "segments" JSONB NOT NULL DEFAULT '[]',
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subtitle" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subtitle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_materialId_key" ON "Transcript"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "Subtitle_materialId_language_key" ON "Subtitle"("materialId", "language");

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtitle" ADD CONSTRAINT "Subtitle_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

