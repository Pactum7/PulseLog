import { describe, expect, it } from "vitest";
import { getQuerySuggestions } from "./query-suggestions";
import type { FieldInfo } from "./types";

const fields: FieldInfo[] = [
  { name: "service.name", types: ["keyword"], searchable: true, aggregatable: true },
  { name: "message", types: ["text"], searchable: true, aggregatable: false },
  { name: "success", types: ["boolean"], searchable: true, aggregatable: true },
];

describe("getQuerySuggestions", () => {
  it("suggests matching fields", () => expect(getQuerySuggestions("serv", 4, fields)[0]).toMatchObject({ label: "service.name", insertText: "service.name:" }));
  it("replaces a partial field and its colon without duplicating punctuation", () => expect(getQuerySuggestions("serv:", 5, fields)[0]).toMatchObject({ replaceFrom: 0, replaceTo: 5 }));
  it("suggests conditions based on field type", () => {
    expect(getQuerySuggestions("success:", 8, fields).map((item) => item.label)).toEqual(["EXISTS", "true", "false"]);
    expect(getQuerySuggestions("message:", 8, fields).map((item) => item.label)).toContain("\"短语\"");
  });
  it("suggests boolean operators after a clause", () => expect(getQuerySuggestions("service.name:api A", 18, fields)[0]).toMatchObject({ label: "AND" }));
});
