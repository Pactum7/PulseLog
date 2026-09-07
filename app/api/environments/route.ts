import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { listEnvironments, saveEnvironment } from "@/lib/environments";
import { environmentSchema } from "@/lib/validation";

export async function GET() {
  try { await requireAuth(); return NextResponse.json(await listEnvironments()); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const input = environmentSchema.parse(await request.json());
    const id = await saveEnvironment(input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return apiError(error); }
}
