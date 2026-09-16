import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { closePit } from "@/lib/elasticsearch";
import { isMockMode, MOCK_ENVIRONMENT_ID } from "@/lib/mock-mode";

export async function POST(request: Request) {
  try {
    await requireAuth();
    const { environmentId, pitId } = await request.json() as { environmentId?: string; pitId?: string };
    if (environmentId && pitId && !(isMockMode() && environmentId === MOCK_ENVIRONMENT_ID)) await closePit(environmentId, pitId);
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
