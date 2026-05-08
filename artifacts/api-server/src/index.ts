import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./lib/seed";
import { writeLog } from "./lib/writeLog";
import { isEncryptionEnabled } from "./lib/credentials";

process.on("unhandledRejection", (reason: unknown) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err: Error) => {
  logger.error({ err }, "Uncaught exception");
  process.exit(1);
});

// Validate required environment variables
const requiredEnvVars = [
  "PORT",
  "DATABASE_URL",
  "CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`${envVar} environment variable is required but was not provided.`);
  }
}

// Enforce encryption key in production
if (process.env.NODE_ENV === "production" && !isEncryptionEnabled()) {
  throw new Error(
    "CREDENTIAL_ENCRYPTION_KEY is required in production. " +
    "Generate a key with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
    "and set it as the CREDENTIAL_ENCRYPTION_KEY environment variable.",
  );
}

const rawPort = process.env["PORT"]!;
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");

  seedIfEmpty().catch((err) => {
    logger.error({ err }, "Seeding failed");
  });

  void writeLog({
    category: "system",
    message: `CryptoGuard API server started on port ${port}`,
    metadata: { port },
  });
});

server.on("error", (err: Error) => {
  logger.error({ err }, "Server failed to bind");
  process.exit(1);
});
