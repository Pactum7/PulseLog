import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { searchLogs } from "@/lib/elasticsearch";
import { searchSchema } from "@/lib/validation";
import { isMockMode, MOCK_ENVIRONMENT_ID } from "@/lib/mock-mode";
import { searchMockLogs } from "@/lib/mock-data";

export async function POST(request: Request) {
  try {
    await requireAuth();
    const input = searchSchema.parse(await request.json());
    if (isMockMode() && input.environmentId === MOCK_ENVIRONMENT_ID) return NextResponse.json(searchMockLogs(input));
    return NextResponse.json(await searchLogs(input));
  } catch (error) { return apiError(error); }
}
