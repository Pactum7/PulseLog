import "server-only";
import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { decrypt, encrypt } from "./crypto";
import { database, hasDatabase } from "./db";
import type { EnvironmentSecret, EnvironmentSummary } from "./types";

interface EnvRow extends RowDataPacket {
  id: string; name: string; color: string; base_url: string; index_pattern: string;
  timestamp_field: string; message_field: string; auth_type: "basic" | "apiKey" | "none";
  username: string | null; password_encrypted: string | null; api_key_encrypted: string | null;
  ca_cert_encrypted: string | null; tls_verify: number;
}

function bootstrap(): EnvironmentSecret | null {
  if (!process.env.ES_URL) return null;
  const authType = process.env.ES_API_KEY ? "apiKey" : process.env.ES_USERNAME ? "basic" : "none";
  return {
    id: "env-bootstrap", name: process.env.ES_NAME || "Production", color: "#6D5EF7",
    baseUrl: process.env.ES_URL, indexPattern: process.env.ES_INDEX_PATTERN || "logs-*",
    timestampField: process.env.ES_TIMESTAMP_FIELD || "@timestamp",
    messageField: process.env.ES_MESSAGE_FIELD || "message", authType,
    username: process.env.ES_USERNAME, password: process.env.ES_PASSWORD,
    apiKey: process.env.ES_API_KEY, caCert: process.env.ES_CA_CERT?.replaceAll("\\n", "\n"),
    tlsVerify: process.env.ES_TLS_VERIFY !== "false", hasSecret: authType !== "none", source: "environment",
  };
}

function summary(env: EnvironmentSecret): EnvironmentSummary {
  const { password: _p, apiKey: _a, caCert: _c, ...safe } = env;
  void _p; void _a; void _c;
  return safe;
}

function fromRow(row: EnvRow): EnvironmentSecret {
  return {
    id: row.id, name: row.name, color: row.color, baseUrl: row.base_url,
    indexPattern: row.index_pattern, timestampField: row.timestamp_field,
    messageField: row.message_field, authType: row.auth_type,
    username: row.username || undefined, password: decrypt(row.password_encrypted),
    apiKey: decrypt(row.api_key_encrypted), caCert: decrypt(row.ca_cert_encrypted),
    tlsVerify: Boolean(row.tls_verify), hasSecret: Boolean(row.password_encrypted || row.api_key_encrypted),
    source: "database",
  };
}

export async function listEnvironments(): Promise<EnvironmentSummary[]> {
  const items: EnvironmentSecret[] = [];
  const boot = bootstrap();
  if (boot) items.push(boot);
  if (hasDatabase()) {
    const db = await database();
    const [rows] = await db.query<EnvRow[]>("SELECT * FROM environments ORDER BY name");
    items.push(...rows.map(fromRow));
  }
  return items.map(summary);
}

export async function getEnvironment(id: string): Promise<EnvironmentSecret> {
  const boot = bootstrap();
  if (id === boot?.id) return boot;
  if (!hasDatabase()) throw new Error("Environment not found");
  const db = await database();
  const [rows] = await db.query<EnvRow[]>("SELECT * FROM environments WHERE id = ? LIMIT 1", [id]);
  if (!rows[0]) throw new Error("Environment not found");
  return fromRow(rows[0]);
}

export async function saveEnvironment(input: Omit<EnvironmentSecret, "id" | "hasSecret" | "source">): Promise<string> {
  const db = await database();
  const id = randomUUID();
  await db.execute(
    `INSERT INTO environments (id,name,color,base_url,index_pattern,timestamp_field,message_field,auth_type,username,password_encrypted,api_key_encrypted,ca_cert_encrypted,tls_verify)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, input.name, input.color, input.baseUrl, input.indexPattern, input.timestampField, input.messageField,
      input.authType, input.username || null, encrypt(input.password), encrypt(input.apiKey), encrypt(input.caCert), input.tlsVerify],
  );
  return id;
}

export async function deleteEnvironment(id: string): Promise<void> {
  if (id === "env-bootstrap") throw new Error("Environment-variable configuration cannot be deleted");
  const db = await database();
  await db.execute("DELETE FROM environments WHERE id = ?", [id]);
}
