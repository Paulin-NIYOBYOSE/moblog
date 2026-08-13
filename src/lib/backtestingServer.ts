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

/** Finds (or lazily creates) the nested Backtesting Series / {instrument} /
 * {year} folder, reusing the existing MediaFolder/MediaImage gallery as-is —
 * no separate image storage for the Backtesting Gallery. */
export async function resolveGalleryFolderId(instrument: string, year: number): Promise<string> {
  let root = await prisma.mediaFolder.findFirst({
    where: { parentId: null, name: GALLERY_ROOT_FOLDER_NAME },
    select: { id: true },
  });
  if (!root) {
    root = await prisma.mediaFolder.create({
      data: { name: GALLERY_ROOT_FOLDER_NAME, parentId: null },
      select: { id: true },
    });
  }

  let instrumentFolder = await prisma.mediaFolder.findFirst({
    where: { parentId: root.id, name: instrument },
    select: { id: true },
  });
  if (!instrumentFolder) {
    instrumentFolder = await prisma.mediaFolder.create({
      data: { name: instrument, parentId: root.id },
      select: { id: true },
    });
  }

  let yearFolder = await prisma.mediaFolder.findFirst({
    where: { parentId: instrumentFolder.id, name: String(year) },
    select: { id: true },
  });
  if (!yearFolder) {
    yearFolder = await prisma.mediaFolder.create({
      data: { name: String(year), parentId: instrumentFolder.id },
      select: { id: true },
    });
  }

  return yearFolder.id;
}
