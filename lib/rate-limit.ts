const store = new Map<string, number[]>();

// Clean up entries older than 1 hour every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 3_600_000;
  for (const [key, timestamps] of store.entries()) {
    const fresh = timestamps.filter(t => t > cutoff);
    if (fresh.length === 0) store.delete(key);
    else store.set(key, fresh);
  }
}, 600_000);

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const timestamps = (store.get(key) ?? []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxRequests) return false;
  timestamps.push(now);
  store.set(key, timestamps);
  return true;
}

export function getClientIP(req: Request): string {
  const fwd = (req as { headers: Headers }).headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return (req as { headers: Headers }).headers.get("x-real-ip") ?? "unknown";
}
