-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('LONG', 'SHORT');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "startingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "openDate" TIMESTAMP(3) NOT NULL,
    "closeDate" TIMESTAMP(3),
    "pair" TEXT NOT NULL,
    "direction" "Direction" NOT NULL DEFAULT 'LONG',
    "exitLogic" TEXT,
    "pnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "roi" DOUBLE PRECISION,
    "rr" DOUBLE PRECISION,
    "entry" DOUBLE PRECISION,
    "exit" DOUBLE PRECISION,
    "stopLoss" DOUBLE PRECISION,
    "takeProfit" DOUBLE PRECISION,
    "size" DOUBLE PRECISION,
    "riskAmount" DOUBLE PRECISION,
    "setup" TEXT,
    "comment" TEXT,
    "chartUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_isArchived_idx" ON "Account"("isArchived");

-- CreateIndex
CREATE INDEX "Trade_accountId_openDate_idx" ON "Trade"("accountId", "openDate");

-- CreateIndex
CREATE INDEX "Trade_accountId_closeDate_idx" ON "Trade"("accountId", "closeDate");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
