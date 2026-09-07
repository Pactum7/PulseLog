import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { deleteEnvironment } from "@/lib/environments";

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    await deleteEnvironment((await context.params).id);
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
