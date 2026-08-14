import { prisma } from "@/lib/prisma";
import { planSequence } from "@/lib/backtesting";

/** Idempotently seeds the fixed 168-row (instrument x year) plan. All rows
 * start incomplete — this never overwrites existing progress. */
export async function ensureBacktestItemsSeeded(): Promise<void> {
  const count = await prisma.backtestItem.count();
  if (count > 0) return;
  await prisma.backtestItem.createMany({
    data: planSequence(),
    skipDuplicates: true,
  });
}

const GALLERY_ROOT_FOLDER_NAME = "Backtesting Series";

// MediaFolder has no unique constraint on (parentId, name) — the user-facing
// gallery intentionally allows same-named siblings — so every lookup here
// takes the *oldest* match. If a duplicate ever did get created, all callers
// still converge on the same folder rather than splitting images across two.
function findFolder(parentId: string | null, name: string) {
  return prisma.mediaFolder.findFirst({
    where: { parentId, name },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
}

/**
 * Read-only lookup of the Backtesting Series / {instrument} / {year} folder.
 * Returns null when it doesn't exist yet — browsing a pair-year with no
 * screenshots must never write to the database.
 */
export async function findGalleryFolderId(instrument: string, year: number): Promise<string | null> {
  const root = await findFolder(null, GALLERY_ROOT_FOLDER_NAME);
  if (!root) return null;
  const instrumentFolder = await findFolder(root.id, instrument);
  if (!instrumentFolder) return null;
  const yearFolder = await findFolder(instrumentFolder.id, String(year));
  return yearFolder?.id ?? null;
}

async function findOrCreateFolder(parentId: string | null, name: string): Promise<string> {
  const existing = await findFolder(parentId, name);
  if (existing) return existing.id;
  const created = await prisma.mediaFolder.create({ data: { name, parentId }, select: { id: true } });
  return created.id;
}

/**
 * Finds — creating if needed — the Backtesting Series / {instrument} / {year}
 * folder, reusing the existing MediaFolder/MediaImage gallery as-is. Only
 * called when the user actually uploads a screenshot, so the create path is
 * user-initiated and never runs concurrently for the same pair-year.
 */
export async function resolveGalleryFolderId(instrument: string, year: number): Promise<string> {
  const rootId = await findOrCreateFolder(null, GALLERY_ROOT_FOLDER_NAME);
  const instrumentId = await findOrCreateFolder(rootId, instrument);
  return findOrCreateFolder(instrumentId, String(year));
}
