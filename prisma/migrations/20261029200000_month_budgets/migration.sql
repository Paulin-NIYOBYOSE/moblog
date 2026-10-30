-- Budgets become month-specific: every month gets its own spending categories
-- and income sources (with its planned amounts), so changing or removing one
-- never touches another month. Savings goals and kill-list items stay shared.
-- One transaction: a dropped connection leaves the data as it was.

BEGIN;

ALTER TABLE "BudgetCategory" ADD COLUMN "month" TEXT,
ADD COLUMN "planned" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Months that need their own copy of the categories: every month with a plan,
-- and every month with an entry in a category.
CREATE TEMP TABLE "_months" AS
  SELECT "month" AS m FROM "BudgetMonth"
  UNION
  SELECT DISTINCT substr("day", 1, 7) FROM "BudgetEntry" WHERE "categoryId" IS NOT NULL;

-- A planned month gets every category (as its plan editor showed them); any
-- other month only the categories its entries use.
CREATE TEMP TABLE "_copies" AS
  SELECT c."id" AS old_id, mo.m AS month, 'c' || replace(gen_random_uuid()::text, '-', '') AS new_id
  FROM "BudgetCategory" c CROSS JOIN "_months" mo
  WHERE EXISTS (SELECT 1 FROM "BudgetMonth" bm WHERE bm."month" = mo.m)
     OR EXISTS (SELECT 1 FROM "BudgetEntry" e WHERE e."categoryId" = c."id" AND substr(e."day", 1, 7) = mo.m);

INSERT INTO "BudgetCategory" ("id", "month", "name", "emoji", "kind", "planned", "position", "createdAt")
  SELECT cp.new_id, cp.month, c."name", c."emoji", c."kind",
         COALESCE((SELECT (bm."plan" ->> c."id")::DOUBLE PRECISION FROM "BudgetMonth" bm WHERE bm."month" = cp.month), 0),
         c."position", c."createdAt"
  FROM "_copies" cp JOIN "BudgetCategory" c ON c."id" = cp.old_id;

-- Each entry now points at its own month's copy.
UPDATE "BudgetEntry" e SET "categoryId" = cp.new_id
  FROM "_copies" cp
  WHERE e."categoryId" = cp.old_id AND substr(e."day", 1, 7) = cp.month;

-- Categories no month has used yet are kept, in the current month.
UPDATE "BudgetCategory" SET "month" = to_char(now(), 'YYYY-MM')
  WHERE "month" IS NULL AND "id" NOT IN (SELECT old_id FROM "_copies");
DELETE FROM "BudgetCategory" WHERE "month" IS NULL;

-- Plans keep only their saving targets; planned spending now lives on the categories.
UPDATE "BudgetMonth" SET "plan" = COALESCE(
  (SELECT jsonb_object_agg(k, v) FROM jsonb_each("plan") AS p(k, v) WHERE k LIKE 'g:%' OR k LIKE 'k:%'),
  '{}'::jsonb);

DROP TABLE "_copies";
DROP TABLE "_months";

ALTER TABLE "BudgetCategory" ALTER COLUMN "month" SET NOT NULL;

-- CreateIndex
CREATE INDEX "BudgetCategory_month_idx" ON "BudgetCategory"("month");

COMMIT;
