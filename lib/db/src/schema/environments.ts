import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const environmentsTable = pgTable("environments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // on_premises | aws | azure | gcp | vmware
  status: text("status").notNull().default("disconnected"), // connected | disconnected | scanning | error
  region: text("region"),
  credentialHint: text("credential_hint"),
  lastScannedAt: timestamp("last_scanned_at"),
  assetCount: integer("asset_count").notNull().default(0),
  riskScore: integer("risk_score").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEnvironmentSchema = createInsertSchema(environmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEnvironment = z.infer<typeof insertEnvironmentSchema>;
export type Environment = typeof environmentsTable.$inferSelect;
