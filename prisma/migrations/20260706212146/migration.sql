/*
  Warnings:

  - The values [PHOTO,STORY,OTHER] on the enum `ContentType` will be removed. If these variants are still used in the database, this will fail.
  - The values [OTHER] on the enum `Platform` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `thumbnailUrl` on the `Content` table. All the data in the column will be lost.
  - The `nextStatus` column on the `Content` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ContentType_new" AS ENUM ('SHORT', 'LIVE_STREAM', 'PHOTOS', 'TEXT_STORY', 'REEL', 'POST', 'THREAD', 'VIDEO');
ALTER TABLE "public"."Content" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Content" ALTER COLUMN "type" TYPE "ContentType_new" USING ("type"::text::"ContentType_new");
ALTER TYPE "ContentType" RENAME TO "ContentType_old";
ALTER TYPE "ContentType_new" RENAME TO "ContentType";
DROP TYPE "public"."ContentType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "Platform_new" AS ENUM ('INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'X', 'LINKEDIN', 'TWITCH');
ALTER TABLE "Content" ALTER COLUMN "platforms" TYPE "Platform_new"[] USING ("platforms"::text::"Platform_new"[]);
ALTER TYPE "Platform" RENAME TO "Platform_old";
ALTER TYPE "Platform_new" RENAME TO "Platform";
DROP TYPE "public"."Platform_old";
COMMIT;

-- DropIndex
DROP INDEX "Content_createdAt_idx";

-- AlterTable
ALTER TABLE "Content" DROP COLUMN "thumbnailUrl",
ADD COLUMN     "visuals" TEXT,
ALTER COLUMN "type" DROP DEFAULT,
DROP COLUMN "nextStatus",
ADD COLUMN     "nextStatus" TEXT;

-- CreateIndex
CREATE INDEX "Content_type_idx" ON "Content"("type");
