-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('IDEA', 'DRAFT', 'READY', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'X', 'LINKEDIN', 'TWITCH', 'OTHER');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('SHORT', 'LIVE_STREAM', 'PHOTO', 'VIDEO', 'THREAD', 'POST', 'STORY', 'REEL', 'OTHER');

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'IDEA',
    "platforms" "Platform"[],
    "type" "ContentType" NOT NULL DEFAULT 'POST',
    "topics" TEXT[],
    "thumbnailUrl" TEXT,
    "url" TEXT,
    "notes" TEXT,
    "nextStatus" "ContentStatus",
    "publishDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Content_status_idx" ON "Content"("status");

-- CreateIndex
CREATE INDEX "Content_publishDate_idx" ON "Content"("publishDate");

-- CreateIndex
CREATE INDEX "Content_createdAt_idx" ON "Content"("createdAt");
