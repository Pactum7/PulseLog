import { describe, expect, it } from "vitest";
import { searchMockLogs } from "./mock-data";

const now = Date.parse("2026-09-16T08:00:00.000Z");
const base = {
  environmentId: "mock-demo",
  query: "",
  from: new Date(now - 24 * 60 * 60_000).toISOString(),
  to: new Date(now).toISOString(),
  size: 100,
};

describe("searchMockLogs", () => {
  it("returns paginated logs and a histogram", () => {
    const first = searchMockLogs(base, now);
    expect(first.total).toBeGreaterThan(500);
    expect(first.hits).toHaveLength(100);
    expect(first.nextCursor).toEqual([100]);
    expect(first.histogram.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(first.total);
  });

  it("supports field, boolean and wildcard filters", () => {
    const filtered = searchMockLogs({ ...base, query: "service.name:payment-service AND success:true" }, now);
    expect(filtered.total).toBeGreaterThan(0);
    expect(filtered.hits.every((hit) => hit.source.success === true)).toBe(true);
    expect(searchMockLogs({ ...base, query: "message.pattern:*timeout*" }, now).total).toBeGreaterThan(0);
  });

  it("supports exists queries", () => {
    expect(searchMockLogs({ ...base, query: "request:EXISTS" }, now).total).toBeGreaterThan(0);
  });
});
