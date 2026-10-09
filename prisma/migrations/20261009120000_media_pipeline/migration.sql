-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'REJECTED');

-- AlterTable
ALTER TABLE "StoredFile" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "audioCodec" TEXT,
ADD COLUMN     "container" TEXT,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "playbackFileId" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "status" "FileStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN     "statusCode" TEXT,
ADD COLUMN     "thumbnailFileId" TEXT,
ADD COLUMN     "videoCodec" TEXT,
ADD COLUMN     "width" INTEGER;

-- CreateIndex
CREATE INDEX "StoredFile_status_idx" ON "StoredFile"("status");

