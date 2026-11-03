import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";
import type { BacktestScheduleConfig } from "@/lib/backtestSchedule";
import { getDefaultSchedule, validateSchedule } from "@/lib/backtestSchedule";

const SCHEDULE_KEY = "backtestSchedule";

export async function GET() {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const meta = await prisma.notebookMeta.findUnique({
      where: { key: SCHEDULE_KEY },
    });

    if (!meta) {
      // Return default schedule if not yet customized
      return NextResponse.json(getDefaultSchedule());
    }

    return NextResponse.json(meta.value as unknown as BacktestScheduleConfig);
  } catch (error) {
    console.error("Failed to fetch backtest schedule:", error);
    return NextResponse.json(
      { error: "Failed to fetch schedule" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = (await request.json()) as BacktestScheduleConfig;

    // Validate the configuration
    const validation = validateSchedule(config);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Invalid schedule", details: validation.errors },
        { status: 400 },
      );
    }

    // Update timestamp
    config.lastUpdated = new Date().toISOString();

    // Upsert the schedule
    await prisma.notebookMeta.upsert({
      where: { key: SCHEDULE_KEY },
      create: {
        key: SCHEDULE_KEY,
        value: config as any,
      },
      update: {
        value: config as any,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(config);
  } catch (error) {
    console.error("Failed to update backtest schedule:", error);
    return NextResponse.json(
      { error: "Failed to update schedule" },
      { status: 500 },
    );
  }
}
