-- Notebook v2: money first. Removes the daily pages (priorities, mood,
-- reflections), adds weekly habit goals, income sources, savings goals, and
-- savings on kill-list items (so an item can have many entries, not one).

-- DropIndex
DROP INDEX "BudgetEntry_killItemId_key";

-- AlterTable
ALTER TABLE "BudgetCategory" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'expense';

-- AlterTable
ALTER TABLE "BudgetEntry" ADD COLUMN     "fromSavings" DOUBLE PRECISION,
ADD COLUMN     "goalId" TEXT;

-- AlterTable
ALTER TABLE "Habit" ADD COLUMN     "perWeek" INTEGER;

-- DropTable
DROP TABLE "NotebookDay";

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "target" DOUBLE PRECISION,
    "targetMonth" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetEntry_killItemId_idx" ON "BudgetEntry"("killItemId");

-- CreateIndex
CREATE INDEX "BudgetEntry_goalId_idx" ON "BudgetEntry"("goalId");

-- AddForeignKey
ALTER TABLE "BudgetEntry" ADD CONSTRAINT "BudgetEntry_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

