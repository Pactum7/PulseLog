CREATE TABLE IF NOT EXISTS environments (
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
  tls_verify BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
