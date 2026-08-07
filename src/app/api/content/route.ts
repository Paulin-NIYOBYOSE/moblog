import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";
import type { ContentStatus, Platform, ContentType } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseContentStatus(value: unknown): ContentStatus {
  const validStatuses: ContentStatus[] = ["IDEA", "DRAFT", "READY", "PUBLISHED", "ARCHIVED"];
  const status = String(value ?? "").toUpperCase();
  return validStatuses.includes(status as ContentStatus) ? (status as ContentStatus) : "IDEA";
}

function parsePlatforms(value: unknown): Platform[] {
  const validPlatforms: Platform[] = ["INSTAGRAM", "TIKTOK", "YOUTUBE", "X", "LINKEDIN", "TWITCH"];
  const platforms = Array.isArray(value) ? value : [value];
  return platforms
    .map((p) => String(p ?? "").toUpperCase())
    .filter((p) => validPlatforms.includes(p as Platform)) as Platform[];
}

function parseContentType(value: unknown): ContentType {
  const validTypes: ContentType[] = ["SHORT", "LIVE_STREAM", "PHOTOS", "TEXT_STORY", "REEL", "POST", "THREAD", "VIDEO"];
  const type = String(value ?? "").toUpperCase();
  return validTypes.includes(type as ContentType) ? (type as ContentType) : "SHORT";
}

function parseTopics(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((t) => String(t ?? "").trim()).filter(Boolean);
  }
  if (value && typeof value === "string") {
    return value.split(",").map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

function toDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

// GET /api/content  -> list all content
export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const platform = searchParams.get("platform");
    const topic = searchParams.get("topic");

    const where: any = {};
    if (status) where.status = status.toUpperCase();
    if (type) where.type = type.toUpperCase();
    if (platform) where.platforms = { has: platform.toUpperCase() };
    if (topic) where.topics = { has: topic };

    const content = await prisma.content.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(content);
  } catch (error) {
    console.error("GET /api/content failed:", error);
    return NextResponse.json(
      { error: "Failed to load content." },
      { status: 500 },
    );
  }
}

// POST /api/content  -> create content
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();

    const title = String(body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }

    const content = await prisma.content.create({
      data: {
        title,
        status: parseContentStatus(body.status),
        platforms: parsePlatforms(body.platforms),
        publishDate: toDateOrNull(body.publishDate),
        type: parseContentType(body.type),
        url: body.url ? String(body.url).trim() : null,
        visuals: body.visuals ? String(body.visuals).trim() : null,
        nextStatus: body.nextStatus ? String(body.nextStatus).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
        topics: parseTopics(body.topics),
      },
    });

    return NextResponse.json(content, { status: 201 });
  } catch (error) {
    console.error("POST /api/content failed:", error);
    return NextResponse.json({ error: "Failed to create content." }, { status: 500 });
  }
}
