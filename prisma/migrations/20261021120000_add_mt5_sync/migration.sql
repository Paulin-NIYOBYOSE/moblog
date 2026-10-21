-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "mt5KeyHash" TEXT,
ADD COLUMN     "mt5Login" TEXT,
ADD COLUMN     "mt5Server" TEXT,
ADD COLUMN     "mt5SyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "mt5Ticket" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Account_mt5KeyHash_key" ON "Account"("mt5KeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_accountId_mt5Ticket_key" ON "Trade"("accountId", "mt5Ticket");

