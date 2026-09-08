import type { estypes } from "@elastic/elasticsearch";
import type { FieldInfo } from "./types";

type Token = { type: "word" | "phrase" | "colon" | "and" | "or" | "lparen" | "rparen"; value: string; pos: number };
export type QueryNode =
  | { kind: "term"; field?: string; value: string; quoted: boolean }
  | { kind: "and" | "or"; left: QueryNode; right: QueryNode };

export class QuerySyntaxError extends Error {
  constructor(message: string, public readonly position: number) {
    super(message);
    this.name = "QuerySyntaxError";
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) { i++; continue; }
    const start = i;
    if (source[i] === ":") { tokens.push({ type: "colon", value: ":", pos: i++ }); continue; }
    if (source[i] === "(") { tokens.push({ type: "lparen", value: "(", pos: i++ }); continue; }
    if (source[i] === ")") { tokens.push({ type: "rparen", value: ")", pos: i++ }); continue; }
    if (source[i] === '"') {
      i++;
      let value = "";
      while (i < source.length && source[i] !== '"') {
        if (source[i] === "\\" && i + 1 < source.length) i++;
        value += source[i++];
      }
      if (source[i] !== '"') throw new QuerySyntaxError("Unclosed quoted phrase", start);
      i++;
      tokens.push({ type: "phrase", value, pos: start });
      continue;
    }
    let value = "";
    while (i < source.length && !/[\s:()]/.test(source[i])) value += source[i++];
    const upper = value.toUpperCase();
    tokens.push({ type: upper === "AND" ? "and" : upper === "OR" ? "or" : "word", value, pos: start });
  }
  return tokens;
}

export function parseQuery(source: string): QueryNode | null {
  const tokens = tokenize(source.trim());
  if (!tokens.length) return null;
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = () => tokens[cursor++];

  function primary(): QueryNode {
    if (peek()?.type === "lparen") {
      take();
      const node = orExpression();
      if (take()?.type !== "rparen") throw new QuerySyntaxError("Expected closing parenthesis", peek()?.pos ?? source.length);
      return node;
    }
    const first = take();
    if (!first || (first.type !== "word" && first.type !== "phrase")) {
      throw new QuerySyntaxError("Expected a search term", first?.pos ?? source.length);
    }
    if (first.type === "word" && peek()?.type === "colon") {
      take();
      const value = take();
      if (!value || (value.type !== "word" && value.type !== "phrase")) {
        throw new QuerySyntaxError("Expected a value after ':'", value?.pos ?? source.length);
      }
      return { kind: "term", field: first.value, value: value.value, quoted: value.type === "phrase" };
    }
    return { kind: "term", value: first.value, quoted: first.type === "phrase" };
  }

  function andExpression(): QueryNode {
    let left = primary();
    while (cursor < tokens.length && peek().type !== "or" && peek().type !== "rparen") {
      if (peek().type === "and") take();
      const right = primary();
      left = { kind: "and", left, right };
    }
    return left;
  }

  function orExpression(): QueryNode {
    let left = andExpression();
    while (peek()?.type === "or") {
      take();
      left = { kind: "or", left, right: andExpression() };
    }
    return left;
  }

  const result = orExpression();
  if (cursor < tokens.length) throw new QuerySyntaxError(`Unexpected token '${peek().value}'`, peek().pos);
  return result;
}

function scalar(value: string, type: string): string | number | boolean {
  if (["integer", "long", "short", "byte", "double", "float", "half_float", "scaled_float"].includes(type)) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new QuerySyntaxError(`'${value}' is not a valid number`, 0);
    return number;
  }
  if (type === "boolean") {
    if (!/^(true|false)$/i.test(value)) throw new QuerySyntaxError(`'${value}' is not a valid boolean`, 0);
    return value.toLowerCase() === "true";
  }
  return value;
}

function compileTerm(node: Extract<QueryNode, { kind: "term" }>, fields: Map<string, FieldInfo>, defaultField: string): estypes.QueryDslQueryContainer {
  if (node.field?.toLowerCase() === "_exists_") {
    const target = node.value;
    if (!fields.has(target)) throw new QuerySyntaxError(`Unknown or non-searchable field '${target}'`, 0);
    return { exists: { field: target } };
  }
  const field = node.field || defaultField;
  const info = fields.get(field);
  if (node.field && !info) throw new QuerySyntaxError(`Unknown or non-searchable field '${field}'`, 0);
  const type = info?.types[0] || "text";
  if (!node.quoted && (node.value === "*" || node.value.toUpperCase() === "EXISTS")) {
    return { exists: { field } };
  }
  const hasWildcard = !node.quoted && (node.value.includes("*") || node.value.includes("?"));

  if (hasWildcard) {
    if (["wildcard", "keyword", "constant_keyword"].includes(type)) {
      return { wildcard: { [field]: { value: node.value, case_insensitive: true } } };
    }
    throw new QuerySyntaxError(`Wildcards require a wildcard or keyword field; '${field}' is ${type}`, 0);
  }
  if (type === "text" || type === "match_only_text") {
    return node.quoted
      ? { match_phrase: { [field]: node.value } }
      : { match: { [field]: { query: node.value, operator: "and" } } };
  }
  return { term: { [field]: { value: scalar(node.value, type), case_insensitive: ["keyword", "wildcard"].includes(type) || undefined } } };
}

export function compileQuery(node: QueryNode | null, fieldList: FieldInfo[], defaultField: string): estypes.QueryDslQueryContainer {
  if (!node) return { match_all: {} };
  const fields = new Map(fieldList.filter((f) => f.searchable).map((f) => [f.name, f]));
  function visit(current: QueryNode): estypes.QueryDslQueryContainer {
    if (current.kind === "term") return compileTerm(current, fields, defaultField);
    if (current.kind === "and") return { bool: { must: [visit(current.left), visit(current.right)] } };
    return { bool: { should: [visit(current.left), visit(current.right)], minimum_should_match: 1 } };
  }
  return visit(node);
}

export function parseAndCompile(source: string, fields: FieldInfo[], defaultField: string): estypes.QueryDslQueryContainer {
  return compileQuery(parseQuery(source), fields, defaultField);
}
