import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { errorMiddleware, authMiddleware } from "./middlewares/errorHandler";

const app: Express = express();

// Security headers (replaces helmet)
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// Simple in-memory rate limiter (global: 200 req/min, scan: 10 req/min)
const _rateLimitStore = new Map<string, { count: number; resetAt: number }>();
function _makeRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip ?? "unknown"}:${maxRequests}`;
    const now = Date.now();
    const entry = _rateLimitStore.get(key);
    if (!entry || entry.resetAt <= now) {
      _rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > maxRequests) {
      res.status(429).json({ error: "TOO_MANY_REQUESTS", message: "Rate limit exceeded. Please retry later." });
      return;
    }
    next();
  };
}
const globalRateLimit = _makeRateLimiter(200, 60_000);
export const scanRateLimit = _makeRateLimiter(10, 60_000);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(globalRateLimit);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Configure CORS with restricted origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0 && process.env.NODE_ENV === "production") {
  logger.warn(
    "ALLOWED_ORIGINS not configured in production. CORS will be disabled.",
  );
}

app.use(
  cors({
    credentials: true,
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Global auth middleware - protect all /api routes
app.use("/api", authMiddleware);

// API routes
app.use("/api", router);

// Global error handling middleware (must be last)
app.use(errorMiddleware);

export default app;
