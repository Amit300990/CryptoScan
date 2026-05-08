import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import authRouter from "./routes/auth";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";
import { errorMiddleware } from "./middlewares/errorHandler";
import { jwtAuthMiddleware } from "./lib/jwtAuth";
import { globalRateLimit } from "./lib/rateLimiter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(globalRateLimit);

// CORS — allow configured origins + localhost in development
const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const devOrigins =
  process.env.NODE_ENV !== "production"
    ? ["http://localhost:5173", "http://127.0.0.1:5173"]
    : [];

const effectiveOrigins = [...configuredOrigins, ...devOrigins];

if (effectiveOrigins.length === 0 && process.env.NODE_ENV === "production") {
  logger.warn("ALLOWED_ORIGINS not configured in production. CORS will be disabled.");
}

app.use(
  cors({
    credentials: true,
    origin: effectiveOrigins.length > 0 ? effectiveOrigins : false,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Public endpoints — no JWT required
app.use("/api", authRouter);
app.use("/api", healthRouter);

// JWT middleware — protects every route registered below this line
app.use("/api", jwtAuthMiddleware);

// Protected API routes
app.use("/api", router);

// Serve built frontend in production (single-service deployment)
if (process.env.NODE_ENV === "production") {
  const staticPath = path.join(__dirname, "public");
  app.use(express.static(staticPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });
}

// Global error handler (must be last)
app.use(errorMiddleware);

export default app;
