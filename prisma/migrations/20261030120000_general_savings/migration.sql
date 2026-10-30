-- Savings become one place: general savings (fed by what each month doesn't
-- plan for) and the kill list — the things you save for. Savings goals become
-- kill-list items (same id, money and plans), so nothing saved is lost. One
-- transaction: a dropped connection leaves the data as it was.

BEGIN;

-- Goals → items at the end of the list.
INSERT INTO "KillItem" ("id", "name", "price", "position", "targetMonth", "createdAt", "updatedAt")
  SELECT g."id", COALESCE(g."emoji" || ' ', '') || g."name", g."target",
         (SELECT COALESCE(max("position"), -1) FROM "KillItem" WHERE "boughtOn" IS NULL) + row_number() OVER (ORDER BY g."position", g."createdAt"),
         g."targetMonth", g."createdAt", now()
  FROM "SavingsGoal" g;
UPDATE "BudgetEntry" SET "killItemId" = "goalId" WHERE "goalId" IS NOT NULL;

-- Plans: "g:<id>" → "k:<id>"; general savings isn't planned any more (it gets what's left).
UPDATE "BudgetMonth" SET "plan" = COALESCE(
  (SELECT jsonb_object_agg(CASE WHEN k LIKE 'g:%' THEN 'k:' || substr(k, 3) ELSE k END, v) FROM jsonb_each("plan") AS p(k, v) WHERE k LIKE 'g:%' OR k LIKE 'k:%'),
  '{}'::jsonb);

-- DropForeignKey
ALTER TABLE "BudgetEntry" DROP CONSTRAINT "BudgetEntry_goalId_fkey";

-- DropIndex
DROP INDEX "BudgetEntry_goalId_idx";

-- AlterTable
ALTER TABLE "BudgetEntry" DROP COLUMN "goalId";

-- DropTable
DROP TABLE "SavingsGoal";

COMMIT;
