import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scanJobsTable = pgTable("scan_jobs", {
  id: serial("id").primaryKey(),
  environmentId: integer("environment_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | running | completed | failed
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  assetsDiscovered: integer("assets_discovered").notNull().default(0),
  findingsGenerated: integer("findings_generated").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertScanJobSchema = createInsertSchema(scanJobsTable).omit({ id: true, createdAt: true });
export type InsertScanJob = z.infer<typeof insertScanJobSchema>;
export type ScanJob = typeof scanJobsTable.$inferSelect;
