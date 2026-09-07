import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { fetchFields } from "@/lib/elasticsearch";

export async function GET(request: Request) {
  try {
    await requireAuth();
    const environmentId = new URL(request.url).searchParams.get("environmentId");
    if (!environmentId) return NextResponse.json({ error: "environmentId is required" }, { status: 400 });
    return NextResponse.json(await fetchFields(environmentId));
  } catch (error) { return apiError(error); }
}
