import type { FieldInfo } from "./types";

export type QuerySuggestion = {
  id: string;
  label: string;
  detail: string;
  insertText: string;
  kind: "field" | "value" | "operator";
  replaceFrom: number;
  replaceTo: number;
  keepOpen?: boolean;
  cursorBack?: number;
};

function currentFragment(query: string, cursor: number) {
  const left = query.slice(0, cursor);
  const match = left.match(/(?:^|[\s(])([^\s()]*)$/);
  const value = match?.[1] ?? "";
  return { value, from: cursor - value.length };
}

function fieldSuggestions(fields: FieldInfo[], fragment: string, from: number, cursor: number): QuerySuggestion[] {
  const needle = fragment.toLowerCase();
  return fields
    .filter((field) => field.searchable && field.name.toLowerCase().includes(needle))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name);
    })
    .slice(0, 10)
    .map((field) => ({ id: `field:${field.name}`, label: field.name, detail: field.types.join(", "), insertText: `${field.name}:`, kind: "field" as const, replaceFrom: from, replaceTo: cursor, keepOpen: true }));
}

function valueSuggestions(field: FieldInfo, fragment: string, from: number, cursor: number): QuerySuggestion[] {
  const type = field.types[0] || "keyword";
  const values: Array<[string, string, string, number?]> = [["EXISTS", "字段存在", "EXISTS"]];
  if (type === "boolean") values.push(["true", "布尔值", "true"], ["false", "布尔值", "false"]);
  else if (["integer", "long", "short", "byte", "double", "float", "half_float", "scaled_float"].includes(type)) values.push(["123", "数值条件", "123"]);
  else if (["wildcard", "keyword", "constant_keyword"].includes(type)) values.push(["*包含内容*", "通配符包含匹配", "**", 1], ["\"精确值\"", "精确值", "\"\"", 1]);
  else if (["text", "match_only_text"].includes(type)) values.push(["\"短语\"", "短语匹配", "\"\"", 1]);
  else values.push(["\"值\"", `${type} 条件`, "\"\"", 1]);
  const needle = fragment.toLowerCase();
  return values.filter(([label]) => !needle || label.toLowerCase().includes(needle)).map(([label, detail, insertText, cursorBack]) => ({ id: `value:${field.name}:${label}`, label, detail, insertText, kind: "value" as const, replaceFrom: from, replaceTo: cursor, cursorBack }));
}

export function getQuerySuggestions(query: string, cursor: number, fields: FieldInfo[]): QuerySuggestion[] {
  const safeCursor = Math.max(0, Math.min(cursor, query.length));
  const { value: fragment, from } = currentFragment(query, safeCursor);
  const colon = fragment.indexOf(":");
  if (colon >= 0) {
    const fieldName = fragment.slice(0, colon);
    const field = fields.find((item) => item.searchable && item.name === fieldName);
    if (!field) return fieldSuggestions(fields, fieldName, from, safeCursor);
    return valueSuggestions(field, fragment.slice(colon + 1), from + colon + 1, safeCursor);
  }
  const beforeFragment = query.slice(0, from).trimEnd();
  const canUseOperator = Boolean(beforeFragment) && !/(?:\bAND|\bOR|\()$/i.test(beforeFragment);
  const operators: QuerySuggestion[] = canUseOperator ? (["AND", "OR"] as const)
    .filter((operator) => operator.startsWith(fragment.toUpperCase()))
    .map((operator) => ({ id: `operator:${operator}`, label: operator, detail: operator === "AND" ? "同时满足" : "满足任一条件", insertText: `${operator} `, kind: "operator", replaceFrom: from, replaceTo: safeCursor, keepOpen: true })) : [];
  return [...operators, ...fieldSuggestions(fields, fragment, from, safeCursor)].slice(0, 12);
}
