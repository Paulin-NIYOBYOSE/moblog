-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "startingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "strategy" TEXT,
    "tags" TEXT[],
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestTrade" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
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
    "tags" TEXT[],
    "comment" TEXT,
    "chartUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacktestTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_isArchived_idx" ON "Session"("isArchived");

-- CreateIndex
CREATE INDEX "BacktestTrade_sessionId_openDate_idx" ON "BacktestTrade"("sessionId", "openDate");

-- CreateIndex
CREATE INDEX "BacktestTrade_sessionId_closeDate_idx" ON "BacktestTrade"("sessionId", "closeDate");

-- AddForeignKey
ALTER TABLE "BacktestTrade" ADD CONSTRAINT "BacktestTrade_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
