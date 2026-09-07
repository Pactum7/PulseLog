import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { searchLogs } from "@/lib/elasticsearch";
import { searchSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    await requireAuth();
    return NextResponse.json(await searchLogs(searchSchema.parse(await request.json())));
  } catch (error) { return apiError(error); }
}
