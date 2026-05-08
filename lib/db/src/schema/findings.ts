import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { environmentsTable } from "./environments";
import { cryptoAssetsTable } from "./cryptoAssets";

export const findingsTable = pgTable("findings", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => cryptoAssetsTable.id, { onDelete: "cascade" }),
  environmentId: integer("environment_id").notNull().references(() => environmentsTable.id, { onDelete: "cascade" }),
  policyId: integer("policy_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull(), // critical | high | medium | low
  status: text("status").notNull().default("open"), // open | acknowledged | resolved | suppressed
  remediationAdvice: text("remediation_advice").notNull(),
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("findings_env_id_status_idx").on(table.environmentId, table.status),
  index("findings_severity_status_idx").on(table.severity, table.status),
  index("findings_asset_id_idx").on(table.assetId),
  index("findings_detected_at_idx").on(table.detectedAt),
]);

export const insertFindingSchema = createInsertSchema(findingsTable).omit({ id: true });
export type InsertFinding = z.infer<typeof insertFindingSchema>;
export type Finding = typeof findingsTable.$inferSelect;
