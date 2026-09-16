import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { fetchFields } from "@/lib/elasticsearch";
import { isMockMode, MOCK_ENVIRONMENT_ID } from "@/lib/mock-mode";
import { MOCK_FIELDS } from "@/lib/mock-data";

export async function GET(request: Request) {
  try {
    await requireAuth();
    const environmentId = new URL(request.url).searchParams.get("environmentId");
    if (!environmentId) return NextResponse.json({ error: "environmentId is required" }, { status: 400 });
    if (isMockMode() && environmentId === MOCK_ENVIRONMENT_ID) return NextResponse.json(MOCK_FIELDS);
    return NextResponse.json(await fetchFields(environmentId));
  } catch (error) { return apiError(error); }
}
