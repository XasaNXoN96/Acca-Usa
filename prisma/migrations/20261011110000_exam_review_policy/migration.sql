-- CreateEnum
CREATE TYPE "ReviewPolicy" AS ENUM ('IMMEDIATE', 'AFTER_CLOSE', 'NEVER');

-- AlterTable
ALTER TABLE "Test" ADD COLUMN     "reviewPolicy" "ReviewPolicy" NOT NULL DEFAULT 'IMMEDIATE';

