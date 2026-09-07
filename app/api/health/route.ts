import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok", service: "pulselog", timestamp: new Date().toISOString() });
}
