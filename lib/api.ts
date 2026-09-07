import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { QuerySyntaxError } from "./query-language";
import { publicEsError } from "./elasticsearch";

export function apiError(error: unknown): NextResponse {
  if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
  if (error instanceof QuerySyntaxError) return NextResponse.json({ error: error.message, position: error.position }, { status: 400 });
  const safe = publicEsError(error);
  return NextResponse.json({ error: safe.message, details: safe.details }, { status: safe.status });
}
