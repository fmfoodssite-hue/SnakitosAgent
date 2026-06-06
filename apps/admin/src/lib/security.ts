import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const HASH_PREFIX = "scrypt";

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

