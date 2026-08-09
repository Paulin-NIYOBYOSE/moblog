/*
  Warnings:

  - You are about to drop the `Session` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SessionMonth` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "SessionMonth" DROP CONSTRAINT "SessionMonth_sessionId_fkey";

-- DropTable
DROP TABLE "Session";

-- DropTable
DROP TABLE "SessionMonth";
