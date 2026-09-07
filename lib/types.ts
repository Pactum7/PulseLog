export type AuthType = "basic" | "apiKey" | "none";

export interface EnvironmentSummary {
  id: string;
  name: string;
  color: string;
  baseUrl: string;
  indexPattern: string;
  timestampField: string;
  messageField: string;
  authType: AuthType;
  username?: string;
  tlsVerify: boolean;
  hasSecret: boolean;
  source: "database" | "environment";
}

export interface EnvironmentSecret extends EnvironmentSummary {
  password?: string;
  apiKey?: string;
  caCert?: string;
}

export interface FieldInfo {
  name: string;
  types: string[];
  searchable: boolean;
  aggregatable: boolean;
}

export interface LogHit {
  id: string;
  index: string;
  timestamp: string | null;
  message: string;
  source: Record<string, unknown>;
  sort?: unknown[];
}
