-- Which provider supplied each stored week, and which providers were asked.
-- Weeks stored before the Exness fallback existed came from FXCM alone.
ALTER TABLE "ReplayProviderChunk" ADD COLUMN "source" TEXT,
ADD COLUMN "tried" TEXT[] DEFAULT ARRAY['fxcm']::TEXT[];

UPDATE "ReplayProviderChunk" SET "source" = 'fxcm' WHERE "status" = 'ok';
