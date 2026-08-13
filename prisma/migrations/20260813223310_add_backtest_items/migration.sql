-- CreateTable
CREATE TABLE "BacktestItem" (
    "id" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacktestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BacktestItem_sequence_key" ON "BacktestItem"("sequence");

-- CreateIndex
CREATE INDEX "BacktestItem_completed_idx" ON "BacktestItem"("completed");

-- CreateIndex
CREATE UNIQUE INDEX "BacktestItem_instrument_year_key" ON "BacktestItem"("instrument", "year");
