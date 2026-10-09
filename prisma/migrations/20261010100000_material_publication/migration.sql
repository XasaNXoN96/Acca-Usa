-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "publishAt" TIMESTAMP(3),
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true;

