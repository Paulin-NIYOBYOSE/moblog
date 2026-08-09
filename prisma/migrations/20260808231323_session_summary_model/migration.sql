/*
  Warnings:

  - You are about to drop the `BacktestTrade` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `year` to the `Session` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "BacktestTrade" DROP CONSTRAINT "BacktestTrade_sessionId_fkey";

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "breakevenTrades" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "losses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxDrawdown" DOUBLE PRECISION,
ADD COLUMN     "maxDrawdownPct" DOUBLE PRECISION,
ADD COLUMN     "totalPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalTrades" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "wins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "year" INTEGER NOT NULL;

-- DropTable
DROP TABLE "BacktestTrade";

-- CreateTable
CREATE TABLE "SessionMonth" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "returnPct" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SessionMonth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionMonth_sessionId_idx" ON "SessionMonth"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionMonth_sessionId_month_key" ON "SessionMonth"("sessionId", "month");

-- CreateIndex
CREATE INDEX "Session_pair_idx" ON "Session"("pair");

-- CreateIndex
CREATE INDEX "Session_year_idx" ON "Session"("year");

-- AddForeignKey
ALTER TABLE "SessionMonth" ADD CONSTRAINT "SessionMonth_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
