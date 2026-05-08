import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./lib/seed";
import { writeLog } from "./lib/writeLog";
import { isEncryptionEnabled } from "./lib/credentials";

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

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  try {
    await seedIfEmpty();
  } catch (err) {
    logger.error({ err }, "Seeding failed");
  }

  await writeLog({
    category: "system",
    message: `CryptoGuard API server started on port ${port}`,
    metadata: { port },
  });
});
