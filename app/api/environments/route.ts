import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { listEnvironments, saveEnvironment } from "@/lib/environments";
import { environmentSchema } from "@/lib/validation";
import { isMockMode } from "@/lib/mock-mode";
import { MOCK_ENVIRONMENT } from "@/lib/mock-data";

export async function GET() {
  try { await requireAuth(); return NextResponse.json(isMockMode() ? [MOCK_ENVIRONMENT] : await listEnvironments()); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    if (isMockMode()) return NextResponse.json({ error: "Mock 模式下不能保存环境" }, { status: 409 });
    const input = environmentSchema.parse(await request.json());
    const id = await saveEnvironment(input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return apiError(error); }
}
