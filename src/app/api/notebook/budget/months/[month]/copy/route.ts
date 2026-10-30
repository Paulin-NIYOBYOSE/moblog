import { copyMonth, handle } from "@/lib/server/notebook";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ month: string }> };

// POST /api/notebook/budget/months/:month/copy {from} -> start this month from another month's budget
export async function POST(request: Request, { params }: Params) {
  return handle("POST /api/notebook/budget/months/:month/copy", async () => copyMonth((await params).month, await request.json()));
}
