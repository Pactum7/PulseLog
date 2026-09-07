import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "pulselog_session";

function secret(): Uint8Array {
  const raw = process.env.ENCRYPTION_KEY || process.env.APP_PASSWORD;
  if (!raw || raw.length < 32) throw new Error("ENCRYPTION_KEY (preferred) or a 32+ character APP_PASSWORD is required");
  return new TextEncoder().encode(raw);
}

export async function createSession(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
}

export async function isAuthenticated(): Promise<boolean> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return false;
  try {
    await jwtVerify(value, secret());
    return true;
  } catch {
    return false;
  }
}

export async function requireAuth(): Promise<void> {
  if (!(await isAuthenticated())) throw new Error("UNAUTHORIZED");
}
