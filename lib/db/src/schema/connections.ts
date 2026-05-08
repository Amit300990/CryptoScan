import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { environmentsTable } from "./environments";

export const environmentConnectionsTable = pgTable("environment_connections", {
  id: serial("id").primaryKey(),
  environmentId: integer("environment_id")
    .notNull()
    .references(() => environmentsTable.id, { onDelete: "cascade" }),
  providerType: text("provider_type").notNull(),
  credentials: text("credentials").notNull().default("{}"),
  status: text("status").notNull().default("inactive"),
  lastTestedAt: timestamp("last_tested_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEnvironmentConnectionSchema = createInsertSchema(
  environmentConnectionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertEnvironmentConnection = z.infer<
  typeof insertEnvironmentConnectionSchema
>;
export type EnvironmentConnection =
  typeof environmentConnectionsTable.$inferSelect;
