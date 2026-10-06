import { prisma } from "@/lib/prisma";
import { planSequenceV2 } from "@/lib/backtestV2";

/** Idempotently seeds the 56-row plan. Never overwrites progress. */
export async function ensureV2ItemsSeeded(): Promise<void> {
  const count = await prisma.backtestV2Item.count();
  if (count > 0) return;
  await prisma.backtestV2Item.createMany({ data: planSequenceV2(), skipDuplicates: true });
}
