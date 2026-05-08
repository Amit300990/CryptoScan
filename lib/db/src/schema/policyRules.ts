import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const policyRulesTable = pgTable("policy_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // algorithm | key_length | expiry | quantum_readiness | protocol
  enabled: boolean("enabled").notNull().default(true),
  severity: text("severity").notNull(), // critical | high | medium | low | info
  ruleExpression: text("rule_expression").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPolicyRuleSchema = createInsertSchema(policyRulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPolicyRule = z.infer<typeof insertPolicyRuleSchema>;
export type PolicyRule = typeof policyRulesTable.$inferSelect;
