import { z } from "zod";

export const environmentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6D5EF7"),
  baseUrl: z.string().url().refine((v) => v.startsWith("http://") || v.startsWith("https://")),
  indexPattern: z.string().min(1).max(255).regex(/^[a-zA-Z0-9._*?,+-]+$/).refine((v) => !v.startsWith("_")),
  timestampField: z.string().regex(/^[@a-zA-Z0-9_.-]+$/).default("@timestamp"),
  messageField: z.string().regex(/^[@a-zA-Z0-9_.-]+$/).default("message"),
  authType: z.enum(["basic", "apiKey", "none"]),
  username: z.string().max(255).optional(),
  password: z.string().max(2048).optional(),
  apiKey: z.string().max(4096).optional(),
  caCert: z.string().max(100_000).optional(),
  tlsVerify: z.boolean().default(true),
}).superRefine((v, ctx) => {
  if (v.authType === "basic" && (!v.username || !v.password)) ctx.addIssue({ code: "custom", message: "Basic authentication requires username and password" });
  if (v.authType === "apiKey" && !v.apiKey) ctx.addIssue({ code: "custom", message: "API key authentication requires a key" });
});

export const searchSchema = z.object({
  environmentId: z.string().min(1),
  query: z.string().max(4000).default(""),
  from: z.string().datetime(),
  to: z.string().datetime(),
  size: z.number().int().min(10).max(500).default(100),
  pitId: z.string().optional(),
  searchAfter: z.array(z.unknown()).optional(),
});
