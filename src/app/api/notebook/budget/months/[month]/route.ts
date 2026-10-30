import { handle, saveMonth } from "@/lib/server/notebook";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ month: string }> };

// PUT /api/notebook/budget/months/:month {income, categories: [{id?, name, emoji, planned}], saving: {"k:<killItemId>": amount}}
export async function PUT(request: Request, { params }: Params) {
  return handle("PUT /api/notebook/budget/months/:month", async () => saveMonth((await params).month, await request.json()));
}
