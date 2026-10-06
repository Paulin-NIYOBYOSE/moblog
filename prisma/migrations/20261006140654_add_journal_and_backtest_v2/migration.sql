-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "accountId" TEXT,
    "title" TEXT,
    "mood" INTEGER,
    "discipline" INTEGER,
    "followedPlan" BOOLEAN,
    "emotionsBefore" TEXT[],
    "emotionsAfter" TEXT[],
    "mistakes" TEXT[],
    "tags" TEXT[],
    "tradeIds" TEXT[],
    "checklist" TEXT[],
    "premarket" TEXT,
    "notes" TEXT,
    "lessons" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "caption" TEXT,
    "journalEntryId" TEXT,
    "btItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestV2Item" (
    "id" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacktestV2Item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalEntry_day_idx" ON "JournalEntry"("day");

-- CreateIndex
CREATE INDEX "JournalEntry_accountId_day_idx" ON "JournalEntry"("accountId", "day");

-- CreateIndex
CREATE INDEX "Attachment_journalEntryId_idx" ON "Attachment"("journalEntryId");

-- CreateIndex
CREATE INDEX "Attachment_btItemId_idx" ON "Attachment"("btItemId");

-- CreateIndex
CREATE UNIQUE INDEX "BacktestV2Item_sequence_key" ON "BacktestV2Item"("sequence");

-- CreateIndex
CREATE INDEX "BacktestV2Item_completed_idx" ON "BacktestV2Item"("completed");

-- CreateIndex
CREATE UNIQUE INDEX "BacktestV2Item_instrument_year_key" ON "BacktestV2Item"("instrument", "year");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_btItemId_fkey" FOREIGN KEY ("btItemId") REFERENCES "BacktestV2Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
