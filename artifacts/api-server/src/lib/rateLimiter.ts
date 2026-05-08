import { type Request, type Response, type NextFunction } from "express";

const _store = new Map<string, { count: number; resetAt: number }>();

export function makeRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${(req as unknown as { ip?: string }).ip ?? "unknown"}:${maxRequests}`;
    const now = Date.now();
    const entry = _store.get(key);
    if (!entry || entry.resetAt <= now) {
      _store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > maxRequests) {
      (res as unknown as { status: (c: number) => { json: (b: unknown) => void } })
        .status(429)
        .json({ error: "TOO_MANY_REQUESTS", message: "Rate limit exceeded. Please retry later." });
      return;
    }
    next();
  };
}

export const globalRateLimit = makeRateLimiter(200, 60_000);
export const scanRateLimit = makeRateLimiter(10, 60_000);
