import "server-only";
import { Client, errors, type estypes } from "@elastic/elasticsearch";
import { getEnvironment } from "./environments";
import { parseAndCompile } from "./query-language";
import type { EnvironmentSecret, FieldInfo, LogHit } from "./types";

const clients = new Map<string, Client>();

function auth(env: EnvironmentSecret) {
  if (env.authType === "apiKey" && env.apiKey) return { apiKey: env.apiKey } as const;
  if (env.authType === "basic" && env.username && env.password) return { username: env.username, password: env.password } as const;
  return undefined;
}

export function clientFor(env: EnvironmentSecret): Client {
  const cacheKey = `${env.id}:${env.baseUrl}:${env.username || ""}:${env.hasSecret}`;
  let client = clients.get(cacheKey);
  if (!client) {
    client = new Client({
      node: env.baseUrl,
      auth: auth(env),
      tls: { rejectUnauthorized: env.tlsVerify, ca: env.caCert },
      requestTimeout: 30_000,
      maxRetries: 2,
      sniffOnStart: false,
    });
    clients.set(cacheKey, client);
  }
  return client;
}

export async function fetchFields(environmentId: string): Promise<FieldInfo[]> {
  const env = await getEnvironment(environmentId);
  const response = await clientFor(env).fieldCaps({ index: env.indexPattern, fields: "*", include_unmapped: false });
  return Object.entries(response.fields)
    .map(([name, capabilities]) => {
      const values = Object.values(capabilities);
      return { name, types: Object.keys(capabilities), searchable: values.some((v) => v.searchable), aggregatable: values.some((v) => v.aggregatable) };
    })
    .filter((field) => field.searchable)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function histogramInterval(from: Date, to: Date): string {
  const hours = (to.getTime() - from.getTime()) / 3_600_000;
  if (hours <= 1) return "1m";
  if (hours <= 6) return "5m";
  if (hours <= 24) return "30m";
  if (hours <= 24 * 7) return "3h";
  if (hours <= 24 * 30) return "12h";
  return "1d";
}

export async function searchLogs(input: {
  environmentId: string; query: string; from: string; to: string; size: number; pitId?: string; searchAfter?: unknown[];
}) {
  const env = await getEnvironment(input.environmentId);
  const client = clientFor(env);
  const fields = await fetchFields(env.id);
  const textQuery = parseAndCompile(input.query, fields, env.messageField);
  let pitId = input.pitId;
  if (!pitId) pitId = (await client.openPointInTime({ index: env.indexPattern, keep_alive: "2m" })).id;
  const body = await client.search<Record<string, unknown>>({
    pit: { id: pitId, keep_alive: "2m" },
    size: input.size,
    track_total_hits: true,
    query: { bool: { must: [textQuery], filter: [{ range: { [env.timestampField]: { gte: input.from, lte: input.to } } }] } },
    sort: [{ [env.timestampField]: { order: "desc", unmapped_type: "date" } }, { _shard_doc: "desc" }],
    search_after: input.searchAfter as estypes.FieldValue[] | undefined,
    aggs: {
      timeline: { date_histogram: { field: env.timestampField, fixed_interval: histogramInterval(new Date(input.from), new Date(input.to)), min_doc_count: 0, extended_bounds: { min: input.from, max: input.to } } },
    },
  });
  const hits: LogHit[] = body.hits.hits.map((hit) => {
    const source = hit._source || {};
    return {
      id: hit._id || "", index: hit._index,
      timestamp: typeof source[env.timestampField] === "string" ? source[env.timestampField] as string : null,
      message: typeof source[env.messageField] === "string" ? source[env.messageField] as string : JSON.stringify(source[env.messageField] ?? ""),
      source, sort: hit.sort,
    };
  });
  const timeline = (body.aggregations?.timeline as estypes.AggregationsMultiBucketAggregateBase<estypes.AggregationsDateHistogramBucketKeys>)?.buckets;
  const buckets = Array.isArray(timeline) ? timeline : Object.values(timeline || {});
  return {
    took: body.took, timedOut: body.timed_out, total: typeof body.hits.total === "number" ? body.hits.total : body.hits.total?.value || 0,
    relation: typeof body.hits.total === "number" ? "eq" : body.hits.total?.relation || "eq",
    hits, pitId: body.pit_id || pitId, nextCursor: hits.at(-1)?.sort,
    histogram: buckets.map((bucket) => ({ time: Number(bucket.key), count: bucket.doc_count })),
  };
}

export async function closePit(environmentId: string, pitId: string) {
  const env = await getEnvironment(environmentId);
  await clientFor(env).closePointInTime({ id: pitId });
}

export function publicEsError(error: unknown): { status: number; message: string; details?: string } {
  if (error instanceof errors.ResponseError) {
    const status = error.statusCode || 502;
    const reason = typeof error.body?.error === "object" ? error.body.error.reason : String(error.body?.error || error.message);
    if (status === 401 || status === 403) return { status, message: "Elasticsearch account is not authorized for this operation", details: reason };
    return { status: status >= 400 && status < 600 ? status : 502, message: "Elasticsearch request failed", details: reason };
  }
  return { status: 500, message: error instanceof Error ? error.message : "Unexpected error" };
}
