import { describe, expect, it } from "vitest";
import { parseAndCompile, parseQuery, QuerySyntaxError } from "./query-language";
import type { FieldInfo } from "./types";

const fields: FieldInfo[] = [
  { name: "message", types: ["text"], searchable: true, aggregatable: false },
  { name: "message.pattern", types: ["wildcard"], searchable: true, aggregatable: true },
  { name: "service", types: ["keyword"], searchable: true, aggregatable: true },
  { name: "status", types: ["integer"], searchable: true, aggregatable: true },
];

describe("query language", () => {
  it("compiles wildcard fields to wildcard queries", () => {
    expect(parseAndCompile("message.pattern:*foo*", fields, "message")).toEqual({
      wildcard: { "message.pattern": { value: "*foo*", case_insensitive: true } },
    });
  });
  it("uses match_phrase for quoted text", () => {
    expect(parseAndCompile('message:"connection refused"', fields, "message")).toEqual({ match_phrase: { message: "connection refused" } });
  });
  it("honors AND precedence over OR", () => {
    const result = parseAndCompile("service:api OR status:500 AND message:error", fields, "message");
    expect(result).toHaveProperty("bool.should");
    expect(result).toHaveProperty("bool.should.1.bool.must");
  });
  it("supports implicit AND", () => {
    expect(parseQuery("service:api message:error")).toHaveProperty("kind", "and");
  });
  it("rejects wildcards on text fields", () => {
    expect(() => parseAndCompile("message:*foo*", fields, "message")).toThrow(QuerySyntaxError);
  });
  it("parses numeric values", () => {
    expect(parseAndCompile("status:500", fields, "message")).toEqual({ term: { status: { value: 500 } } });
  });
  it.each(["service:EXISTS", "service:*"])("supports exists query %s", (query) => {
    expect(parseAndCompile(query, fields, "message")).toEqual({ exists: { field: "service" } });
  });
  it("supports Lucene-style _exists_ syntax", () => {
    expect(parseAndCompile("_exists_:message.pattern", fields, "message")).toEqual({ exists: { field: "message.pattern" } });
  });
  it("treats wildcards in quoted keyword values literally", () => {
    expect(parseAndCompile('service:"api*"', fields, "message")).toEqual({ term: { service: { value: "api*", case_insensitive: true } } });
  });
  it("rejects exists queries for unknown fields", () => {
    expect(() => parseAndCompile("missing:EXISTS", fields, "message")).toThrow(QuerySyntaxError);
    expect(() => parseAndCompile("_exists_:missing", fields, "message")).toThrow(QuerySyntaxError);
  });
});
