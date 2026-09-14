import "server-only";
import mysql, { type Pool } from "mysql2/promise";

let pool: Pool | null = null;
let initialized = false;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function database(): Promise<Pool> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!pool) pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 8 });
  if (!initialized) {
    await pool.execute(`CREATE TABLE IF NOT EXISTS environments (
      id CHAR(36) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      color VARCHAR(16) NOT NULL DEFAULT '#6D5EF7',
      base_url VARCHAR(512) NOT NULL,
      index_pattern VARCHAR(255) NOT NULL,
      timestamp_field VARCHAR(128) NOT NULL DEFAULT '@timestamp',
      message_field VARCHAR(128) NOT NULL DEFAULT 'message',
      auth_type ENUM('basic','apiKey','none') NOT NULL DEFAULT 'basic',
      username VARCHAR(255) NULL,
      password_encrypted TEXT NULL,
      api_key_encrypted TEXT NULL,
      ca_cert_encrypted MEDIUMTEXT NULL,
      proxy_url VARCHAR(2048) NULL,
      proxy_username VARCHAR(255) NULL,
      proxy_password_encrypted TEXT NULL,
      tls_verify BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
    const [proxyColumns] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'environments' AND column_name = 'proxy_url'`,
    );
    if (!proxyColumns.length) {
      await pool.execute(`ALTER TABLE environments
        ADD COLUMN proxy_url VARCHAR(2048) NULL AFTER ca_cert_encrypted,
        ADD COLUMN proxy_username VARCHAR(255) NULL AFTER proxy_url,
        ADD COLUMN proxy_password_encrypted TEXT NULL AFTER proxy_username`);
    }
    initialized = true;
  }
  return pool;
}
