import { parseQuery, type QueryNode } from "./query-language";
import { MOCK_ENVIRONMENT_ID } from "./mock-mode";
import type { EnvironmentSummary, FieldInfo, LogHit } from "./types";

export const MOCK_ENVIRONMENT: EnvironmentSummary = {
  id: MOCK_ENVIRONMENT_ID,
  name: "Mock 演示环境",
  color: "#2dd4bf",
  baseUrl: "http://mock.pulselog.local",
  indexPattern: "logs-demo-*",
  timestampField: "@timestamp",
  messageField: "message",
  authType: "none",
  tlsVerify: false,
  hasSecret: false,
  hasProxySecret: false,
  source: "environment",
};

export const MOCK_FIELDS: FieldInfo[] = [
  { name: "@timestamp", types: ["date"], searchable: true, aggregatable: true },
  { name: "environment", types: ["keyword"], searchable: true, aggregatable: true },
  { name: "host.name", types: ["keyword"], searchable: true, aggregatable: true },
  { name: "http.method", types: ["keyword"], searchable: true, aggregatable: true },
  { name: "http.status_code", types: ["integer"], searchable: true, aggregatable: true },
  { name: "level", types: ["keyword"], searchable: true, aggregatable: true },
  { name: "message", types: ["text"], searchable: true, aggregatable: false },
  { name: "message.pattern", types: ["wildcard"], searchable: true, aggregatable: true },
  { name: "request", types: ["object"], searchable: false, aggregatable: false },
  { name: "service.name", types: ["keyword"], searchable: true, aggregatable: true },
  { name: "success", types: ["boolean"], searchable: true, aggregatable: true },
  { name: "tags", types: ["keyword"], searchable: true, aggregatable: true },
  { name: "trace.id", types: ["keyword"], searchable: true, aggregatable: true },
  { name: "user", types: ["object"], searchable: false, aggregatable: false },
];

const services = ["checkout-api", "payment-service", "order-worker", "user-center"];
const hosts = ["prod-app-01", "prod-app-02", "prod-worker-01", "staging-app-01"];
const paths = ["/api/orders", "/api/payments", "/api/users/profile", "/internal/reconcile"];
const methods = ["GET", "POST", "PUT", "DELETE"];
const messages = [
  ["INFO", 200, "Request completed successfully", "request completed in *ms"],
  ["INFO", 201, "Order created and queued for processing", "order * created"],
  ["WARN", 429, "Rate limit threshold reached for client", "rate limit reached for *"],
  ["WARN", 504, "Upstream request timed out after 3000ms", "upstream timeout after *ms"],
  ["ERROR", 500, "Payment authorization failed: provider unavailable", "payment authorization failed: *"],
  ["DEBUG", 200, "Cache hit for user session", "cache hit for session *"],
] as const;

function pathValue(source: Record<string, unknown>, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];
  return path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, source);
}

function buildLogs(now = Date.now()): LogHit[] {
  return Array.from({ length: 1_500 }, (_, index) => {
    const service = services[index % services.length];
    const host = hosts[(index * 7) % hosts.length];
    const path = paths[(index * 5) % paths.length];
    const method = methods[(index * 3) % methods.length];
    const [level, status, baseMessage, pattern] = messages[(index * 11) % messages.length];
    const duration = 18 + (index * 37) % 4_800;
    const timestamp = new Date(now - index * 120_000).toISOString();
    const traceId = `${(index + 10_000).toString(16).padStart(16, "0")}${(index * 7919).toString(16).padStart(16, "0")}`;
    const message = `${baseMessage} · ${method} ${path} · ${duration}ms`;
    const source: Record<string, unknown> = {
      "@timestamp": timestamp,
      environment: index % 9 === 0 ? "staging" : "production",
      host: { name: host, ip: `10.24.${index % 12}.${20 + index % 220}` },
      http: { method, status_code: status },
      level,
      message,
      "message.pattern": pattern,
      request: {
        method,
        path,
        duration_ms: duration,
        headers: { "content-type": "application/json", "x-request-id": `req-${index.toString().padStart(6, "0")}` },
        query: index % 3 ? {} : { page: index % 20, size: 20 },
      },
      service: { name: service, version: `2.${index % 8}.${index % 15}` },
      success: status < 400,
      tags: index % 4 === 0 ? ["api", "slow"] : ["api"],
      trace: { id: traceId },
      user: index % 5 === 0 ? null : { id: `user-${1000 + index % 83}`, roles: index % 7 === 0 ? ["admin", "operator"] : ["viewer"], preferences: { locale: "zh-CN", darkMode: index % 2 === 0 } },
    };
    return { id: `mock-${index.toString().padStart(6, "0")}`, index: `logs-demo-${timestamp.slice(0, 10)}`, timestamp, message, source, sort: [timestamp, index] };
  });
}

function wildcardRegex(value: string): RegExp {
  const escaped = value.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function matchesTerm(node: Extract<QueryNode, { kind: "term" }>, hit: LogHit): boolean {
  const field = node.field?.toLowerCase() === "_exists_" ? node.value : node.field || "message";
  const raw = pathValue(hit.source, field);
  if (node.field?.toLowerCase() === "_exists_" || (!node.quoted && (node.value === "*" || node.value.toUpperCase() === "EXISTS"))) return raw !== undefined && raw !== null;
  const values = (Array.isArray(raw) ? raw : [raw]).filter((value) => value !== undefined && value !== null).map(String);
  if (!node.quoted && (node.value.includes("*") || node.value.includes("?"))) {
    const matcher = wildcardRegex(node.value);
    return values.some((value) => matcher.test(value));
  }
  const needle = node.value.toLowerCase();
  const fieldType = MOCK_FIELDS.find((item) => item.name === field)?.types[0];
  if (fieldType === "text" || !node.field) {
    const terms = needle.split(/\s+/).filter(Boolean);
    return values.some((value) => terms.every((term) => value.toLowerCase().includes(term)));
  }
  return values.some((value) => value.toLowerCase() === needle);
}

function matchesQuery(node: QueryNode | null, hit: LogHit): boolean {
  if (!node) return true;
  if (node.kind === "term") return matchesTerm(node, hit);
  return node.kind === "and" ? matchesQuery(node.left, hit) && matchesQuery(node.right, hit) : matchesQuery(node.left, hit) || matchesQuery(node.right, hit);
}

export type MockSearchInput = { environmentId: string; query: string; from: string; to: string; size: number; pitId?: string; searchAfter?: unknown[] };

export function searchMockLogs(input: MockSearchInput, now = Date.now()) {
  const started = performance.now();
  const from = new Date(input.from).getTime();
  const to = new Date(input.to).getTime();
  const query = parseQuery(input.query);
  const matching = buildLogs(now).filter((hit) => {
    const timestamp = hit.timestamp ? new Date(hit.timestamp).getTime() : 0;
    return timestamp >= from && timestamp <= to && matchesQuery(query, hit);
  });
  const offset = typeof input.searchAfter?.[0] === "number" ? input.searchAfter[0] : 0;
  const hits = matching.slice(offset, offset + input.size);
  const nextOffset = offset + hits.length;
  const bucketSize = Math.max(60_000, Math.ceil(Math.max(to - from, 1) / 40 / 60_000) * 60_000);
  const bucketCount = Math.min(41, Math.max(1, Math.ceil((to - from) / bucketSize)));
  const histogram = Array.from({ length: bucketCount }, (_, index) => ({ time: from + index * bucketSize, count: 0 }));
  for (const hit of matching) {
    const bucket = Math.min(histogram.length - 1, Math.floor((new Date(hit.timestamp || 0).getTime() - from) / bucketSize));
    if (bucket >= 0) histogram[bucket].count++;
  }
  return {
    took: Math.max(1, Math.round(performance.now() - started)),
    timedOut: false,
    total: matching.length,
    relation: "eq",
    hits,
    pitId: input.pitId || `mock-pit-${now}`,
    nextCursor: nextOffset < matching.length ? [nextOffset] : undefined,
    histogram,
  };
}
