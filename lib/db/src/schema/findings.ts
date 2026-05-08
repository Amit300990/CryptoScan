import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const findingsTable = pgTable("findings", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  environmentId: integer("environment_id").notNull(),
  policyId: integer("policy_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull(), // critical | high | medium | low
  status: text("status").notNull().default("open"), // open | acknowledged | resolved | suppressed
  remediationAdvice: text("remediation_advice").notNull(),
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertFindingSchema = createInsertSchema(findingsTable).omit({ id: true });
export type InsertFinding = z.infer<typeof insertFindingSchema>;
export type Finding = typeof findingsTable.$inferSelect;
