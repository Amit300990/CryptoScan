import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, settingsTable } from "@workspace/db";
import { writeLog } from "../lib/writeLog";
import { asyncHandler, ApiError } from "../middlewares/errorHandler";

const router: IRouter = Router();

const VALID_KEYS = ["policy_defaults", "log_forwarding", "sso"] as const;
type SettingKey = (typeof VALID_KEYS)[number];

const SETTING_SCHEMAS: Record<SettingKey, z.ZodTypeAny> = {
  policy_defaults: z.object({
    criticalRiskThreshold: z.number().int().min(0).max(100).optional(),
    highRiskThreshold: z.number().int().min(0).max(100).optional(),
    autoRemediationEnabled: z.boolean().optional(),
    requireApprovalForChanges: z.boolean().optional(),
    minimumKeySize: z.number().int().positive().optional(),
    prohibitedAlgorithms: z.string().optional(),
    policyMode: z.enum(["enforce", "audit"]).optional(),
  }),
  log_forwarding: z.object({
    enabled: z.boolean().optional(),
    host: z.string().optional(),
    port: z.number().int().min(1).max(65535).optional(),
    protocol: z.enum(["udp", "tcp", "tcp+tls"]).optional(),
    facility: z.string().optional(),
    format: z.enum(["rfc5424", "rfc3164", "json"]).optional(),
    tlsEnabled: z.boolean().optional(),
    tlsCertPath: z.string().optional(),
  }),
  sso: z.object({
    enabled: z.boolean().optional(),
    provider: z.enum(["oidc", "saml"]).optional(),
    oidcDiscoveryUrl: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    redirectUri: z.string().optional(),
    scopes: z.string().optional(),
    samlMetadataUrl: z.string().optional(),
    samlEntityId: z.string().optional(),
    samlAcsUrl: z.string().optional(),
    allowedDomains: z.string().optional(),
    groupAttribute: z.string().optional(),
    adminGroup: z.string().optional(),
  }),
};

function redactSensitiveFields(key: SettingKey, value: unknown): unknown {
  if (key === "sso" && typeof value === "object" && value !== null) {
    const v = value as Record<string, unknown>;
    if (v.clientSecret) return { ...v, clientSecret: "••••••••" };
  }
  return value;
}

router.get(
  "/settings",
  asyncHandler(async (_req, res): Promise<void> => {
    const rows = await db.select().from(settingsTable);
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      result[row.key] = redactSensitiveFields(row.key as SettingKey, row.value);
    }
    res.json(result);
  }),
);

router.get(
  "/settings/:key",
  asyncHandler(async (req, res): Promise<void> => {
    const key = req.params.key as SettingKey;
    if (!VALID_KEYS.includes(key)) {
      throw new ApiError(400, "INVALID_KEY", `Invalid settings key. Valid keys: ${VALID_KEYS.join(", ")}`);
    }
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
    res.json(redactSensitiveFields(key, row?.value ?? {}));
  }),
);

router.put(
  "/settings/:key",
  asyncHandler(async (req, res): Promise<void> => {
    const key = req.params.key as SettingKey;
    if (!VALID_KEYS.includes(key)) {
      throw new ApiError(400, "INVALID_KEY", `Invalid settings key. Valid keys: ${VALID_KEYS.join(", ")}`);
    }

    const schema = SETTING_SCHEMAS[key];
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }

    const [row] = await db
      .insert(settingsTable)
      .values({ key, value: parsed.data as Record<string, unknown>, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { value: parsed.data as Record<string, unknown>, updatedAt: new Date() },
      })
      .returning();

    void writeLog({ category: "system", message: `Settings updated: ${key}`, metadata: { key } });
    res.json(redactSensitiveFields(key, row.value));
  }),
);

export default router;
