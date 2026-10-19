-- CreateTable
CREATE TABLE "ReplayDataset" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'import',
    "priceBasis" TEXT NOT NULL,
    "meta" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplayDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplayProviderChunk" (
    "datasetId" TEXT NOT NULL,
    "chunk" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "quality" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplayProviderChunk_pkey" PRIMARY KEY ("datasetId","chunk")
);

-- CreateTable
CREATE TABLE "ReplayCandleDay" (
    "datasetId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "firstT" INTEGER,
    "lastT" INTEGER,
    "bytes" INTEGER NOT NULL,
    "data" BYTEA,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplayCandleDay_pkey" PRIMARY KEY ("datasetId","day")
);

-- CreateTable
CREATE TABLE "ReplaySession" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "strategy" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[],
    "data" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplaySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplayJournalEntry" (
    "sessionId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "entry" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplayJournalEntry_pkey" PRIMARY KEY ("sessionId","tradeId")
);

-- CreateTable
CREATE TABLE "ReplayMeta" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplayMeta_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ReplayDataset_symbol_source_idx" ON "ReplayDataset"("symbol", "source");

-- CreateIndex
CREATE INDEX "ReplaySession_updatedAt_idx" ON "ReplaySession"("updatedAt");

-- AddForeignKey
ALTER TABLE "ReplayProviderChunk" ADD CONSTRAINT "ReplayProviderChunk_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "ReplayDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplayCandleDay" ADD CONSTRAINT "ReplayCandleDay_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "ReplayDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplayJournalEntry" ADD CONSTRAINT "ReplayJournalEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReplaySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

