-- The notebook gets simpler: a monthly budget, savings, the kill list and
-- notes (a planner, day by day). Habits go — the ones you were tracking are
-- kept as a note — and so do income sources: their income stays, noted with
-- the source's name. One transaction: a dropped connection leaves the data
-- as it was.

BEGIN;

-- CreateTable
CREATE TABLE "NotebookNote" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotebookNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotebookNote_day_idx" ON "NotebookNote"("day");

-- The habits you were tracking, kept as a note for today.
INSERT INTO "NotebookNote" ("id", "day", "text", "updatedAt")
  SELECT 'c' || replace(gen_random_uuid()::text, '-', ''), to_char(now(), 'YYYY-MM-DD'),
         'Habits I was tracking: ' || string_agg(COALESCE("emoji" || ' ', '') || "name", ', ' ORDER BY "position", "createdAt"),
         now()
  FROM "Habit"
  WHERE NOT "archived"
  HAVING count(*) > 0;

-- DropTable
DROP TABLE "HabitCheck";
DROP TABLE "Habit";

-- Income sources: their income stays, with the source's name as its note
-- (deleting a category sets its entries' category to NULL).
UPDATE "BudgetEntry" e SET "note" = c."name"
  FROM "BudgetCategory" c
  WHERE e."categoryId" = c."id" AND c."kind" = 'income' AND e."note" IS NULL;
DELETE FROM "BudgetCategory" WHERE "kind" = 'income';

-- AlterTable
ALTER TABLE "BudgetCategory" DROP COLUMN "kind";

-- Sayings you added or pinned: the notebook now shows one saying a month.
DELETE FROM "NotebookMeta" WHERE "key" = 'sayings';

COMMIT;
