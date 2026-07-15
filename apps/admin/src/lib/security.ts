import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const HASH_PREFIX = "scrypt";
const JWT_ALGORITHM = "HS256";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${HASH_PREFIX}:${salt}:${hash}`;
}

export function verifyPassword(password: string, encoded: string) {
  const [scheme, salt, hash] = encoded.split(":");
  if (scheme !== HASH_PREFIX || !salt || !hash) {
    return false;
  }

  const derived = scryptSync(password, salt, 64);
  const original = Buffer.from(hash, "hex");
  return original.length === derived.length && timingSafeEqual(original, derived);
}

export function signPayload(payload: string) {
  if (!env.ADMIN_SESSION_SECRET) {
    throw new Error("ADMIN_SESSION_SECRET is missing.");
  }

  return createHmac("sha256", env.ADMIN_SESSION_SECRET).update(payload).digest("hex");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateRefreshToken() {
  return randomBytes(48).toString("base64url");
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signJwt(payload: Record<string, unknown>, expiresInSeconds: number) {
  if (!env.ADMIN_SESSION_SECRET) {
    throw new Error("ADMIN_SESSION_SECRET is missing.");
  }

  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64UrlEncode(JSON.stringify({ alg: JWT_ALGORITHM, typ: "JWT" }));
  const encodedPayload = base64UrlEncode(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + expiresInSeconds,
    }),
  );
  const signature = createHmac("sha256", env.ADMIN_SESSION_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyJwt(token: string) {
  if (!env.ADMIN_SESSION_SECRET) {
    throw new Error("ADMIN_SESSION_SECRET is missing.");
  }

  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", env.ADMIN_SESSION_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  const header = JSON.parse(base64UrlDecode(encodedHeader)) as { alg?: string; typ?: string };
  if (header.alg !== JWT_ALGORITHM || header.typ !== "JWT") {
    return null;
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Record<string, unknown> & { exp?: number };
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
    return null;
  }

  return payload;
}

