const requests = new Map<string, number[]>();

export function checkRateLimit(key: string, maxRequests = 60, windowMs = 60_000) {
  const now = Date.now();
  const bucket = requests.get(key) ?? [];
  const recent = bucket.filter((timestamp) => now - timestamp < windowMs);
  recent.push(now);
  requests.set(key, recent);
  return {
    allowed: recent.length <= maxRequests,
    remaining: Math.max(0, maxRequests - recent.length),
  };
}

