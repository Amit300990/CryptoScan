import { db, systemLogsTable } from "@workspace/db";
import { logger } from "./logger";

type LogLevel = "info" | "warn" | "error";
type LogCategory = "scan" | "finding" | "policy" | "environment" | "connection" | "system";

interface WriteLogOptions {
  level?: LogLevel;
  category: LogCategory;
  message: string;
  environmentId?: number;
  environmentName?: string;
  metadata?: Record<string, unknown>;
}

export async function writeLog(opts: WriteLogOptions): Promise<void> {
  try {
    await db.insert(systemLogsTable).values({
      level: opts.level ?? "info",
      category: opts.category,
      message: opts.message,
      environmentId: opts.environmentId ?? null,
      environmentName: opts.environmentName ?? null,
      metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
    });
  } catch (err) {
    logger.warn({ err }, "Failed to write audit log");
  }
}
