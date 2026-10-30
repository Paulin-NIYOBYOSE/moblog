import { handle, saveSettings } from "@/lib/server/notebook";

export const dynamic = "force-dynamic";

// PUT /api/notebook/settings {currency?, generalGoal?, generalStart?} -> all the settings
export async function PUT(request: Request) {
  return handle("PUT /api/notebook/settings", async () => saveSettings(await request.json()));
}
