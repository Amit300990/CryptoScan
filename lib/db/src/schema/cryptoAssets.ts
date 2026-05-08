import { pgTable, serial, text, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { environmentsTable } from "./environments";

export const cryptoAssetsTable = pgTable("crypto_assets", {
  id: serial("id").primaryKey(),
  environmentId: integer("environment_id").notNull().references(() => environmentsTable.id, { onDelete: "cascade" }),
  scanJobId: integer("scan_job_id").notNull(),
  name: text("name").notNull(),
  assetType: text("asset_type").notNull(), // certificate | symmetric_key | asymmetric_key | tls_config | ssh_key | code_signing_key | kms_key | secret
  algorithm: text("algorithm"),
  keyLength: integer("key_length"),
  issuer: text("issuer"),
  subject: text("subject"),
  expiresAt: timestamp("expires_at"),
  riskLevel: text("risk_level").notNull().default("info"), // critical | high | medium | low | info
  riskReason: text("risk_reason"),
  remediationAdvice: text("remediation_advice"),
  isQuantumSafe: boolean("is_quantum_safe").notNull().default(false),
  location: text("location"),
  tags: text("tags").notNull().default("[]"), // JSON array stored as text
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("crypto_assets_env_id_idx").on(table.environmentId),
  index("crypto_assets_risk_level_idx").on(table.riskLevel),
  index("crypto_assets_asset_type_idx").on(table.assetType),
  index("crypto_assets_is_quantum_safe_idx").on(table.isQuantumSafe),
  index("crypto_assets_expires_at_idx").on(table.expiresAt),
]);

export const insertCryptoAssetSchema = createInsertSchema(cryptoAssetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCryptoAsset = z.infer<typeof insertCryptoAssetSchema>;
export type CryptoAsset = typeof cryptoAssetsTable.$inferSelect;
