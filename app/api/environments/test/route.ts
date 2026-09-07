import { NextResponse } from "next/server";
import { Client } from "@elastic/elasticsearch";
import { apiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { environmentSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    await requireAuth();
    const input = environmentSchema.parse(await request.json());
    const auth = input.authType === "apiKey" ? { apiKey: input.apiKey! } : input.authType === "basic" ? { username: input.username!, password: input.password! } : undefined;
    const client = new Client({ node: input.baseUrl, auth, tls: { rejectUnauthorized: input.tlsVerify, ca: input.caCert }, requestTimeout: 10_000, maxRetries: 0 });
    const [info, caps] = await Promise.all([client.info(), client.fieldCaps({ index: input.indexPattern, fields: [input.timestampField, input.messageField] })]);
    await client.close();
    return NextResponse.json({ ok: true, cluster: info.cluster_name, version: info.version.number, fields: Object.keys(caps.fields) });
  } catch (error) { return apiError(error); }
}
