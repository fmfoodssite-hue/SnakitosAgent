type SlidingWindowState = {
  timestamps: number[];
};

type OrderFailureState = {
  attempts: number[];
  lockedUntil: number;
};

const requestWindows = new Map<string, SlidingWindowState>();
const orderFailures = new Map<string, OrderFailureState>();

const REQUEST_WINDOW_MS = 2 * 60 * 1000;
const REQUEST_LIMIT = 25;
const ORDER_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const ORDER_FAILURE_LIMIT = 4;
const ORDER_LOCK_MS = 15 * 60 * 1000;

function pruneTimestamps(values: number[], maxAgeMs: number, now: number): number[] {
  return values.filter((value) => now - value < maxAgeMs);
}

function normalizeSecurityKey(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase() || "anonymous";
}

export function buildClientKey(input: {
  ip?: string;
  userId?: string;
  chatId?: string;
  phone?: string;
}): string {
  const parts = [
    normalizeSecurityKey(input.ip),
    normalizeSecurityKey(input.userId),
    normalizeSecurityKey(input.chatId),
    normalizeSecurityKey(input.phone).replace(/\D/g, "").slice(-10),
  ];

  return parts.join(":");
}

export function consumeRequestRateLimit(clientKey: string): {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const normalizedKey = normalizeSecurityKey(clientKey);
  const current = requestWindows.get(normalizedKey) ?? { timestamps: [] };
  const timestamps = pruneTimestamps(current.timestamps, REQUEST_WINDOW_MS, now);

  if (timestamps.length >= REQUEST_LIMIT) {
    const retryAfterMs = Math.max(1_000, REQUEST_WINDOW_MS - (now - timestamps[0]));
    requestWindows.set(normalizedKey, { timestamps });
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  timestamps.push(now);
  requestWindows.set(normalizedKey, { timestamps });

  return {
    allowed: true,
    remaining: Math.max(0, REQUEST_LIMIT - timestamps.length),
    retryAfterSeconds: 0,
  };
}

export function getOrderVerificationBlockState(clientKey: string): {
  blocked: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const normalizedKey = normalizeSecurityKey(clientKey);
  const current = orderFailures.get(normalizedKey);

  if (!current) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  const attempts = pruneTimestamps(current.attempts, ORDER_FAILURE_WINDOW_MS, now);
  const lockedUntil = current.lockedUntil > now ? current.lockedUntil : 0;

  if (attempts.length === 0 && lockedUntil === 0) {
    orderFailures.delete(normalizedKey);
    return { blocked: false, retryAfterSeconds: 0 };
  }

  orderFailures.set(normalizedKey, { attempts, lockedUntil });

  if (lockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil((lockedUntil - now) / 1000),
    };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

export function recordOrderVerificationFailure(clientKey: string): {
  blocked: boolean;
  retryAfterSeconds: number;
  remainingAttempts: number;
} {
  const now = Date.now();
  const normalizedKey = normalizeSecurityKey(clientKey);
  const current = orderFailures.get(normalizedKey) ?? { attempts: [], lockedUntil: 0 };
  const attempts = pruneTimestamps(current.attempts, ORDER_FAILURE_WINDOW_MS, now);

  attempts.push(now);

  let lockedUntil = current.lockedUntil > now ? current.lockedUntil : 0;
  if (attempts.length >= ORDER_FAILURE_LIMIT) {
    lockedUntil = now + ORDER_LOCK_MS;
  }

  orderFailures.set(normalizedKey, { attempts, lockedUntil });

  return {
    blocked: lockedUntil > now,
    retryAfterSeconds: lockedUntil > now ? Math.ceil((lockedUntil - now) / 1000) : 0,
    remainingAttempts: Math.max(0, ORDER_FAILURE_LIMIT - attempts.length),
  };
}

export function clearOrderVerificationFailures(clientKey: string): void {
  orderFailures.delete(normalizeSecurityKey(clientKey));
}
