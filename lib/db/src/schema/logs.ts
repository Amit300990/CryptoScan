import { pgTable, serial, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";

export const systemLogsTable = pgTable("system_logs", {
  id: serial("id").primaryKey(),
  level: varchar("level", { length: 20 }).notNull().default("info"),
  category: varchar("category", { length: 50 }).notNull().default("system"),
  message: text("message").notNull(),
  environmentId: integer("environment_id"),
  environmentName: varchar("environment_name", { length: 255 }),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
