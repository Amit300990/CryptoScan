import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { writeLog } from "../lib/writeLog";
import { asyncHandler, ApiError } from "../middlewares/errorHandler";

const router: IRouter = Router();

const VALID_KEYS = ["policy_defaults", "log_forwarding", "sso"] as const;
type SettingKey = (typeof VALID_KEYS)[number];

router.get(
  "/settings",
  asyncHandler(async (_req, res): Promise<void> => {
    const rows = await db.select().from(settingsTable);
    const result: Record<string, unknown> = {};
    for (const row of rows) result[row.key] = row.value;
    res.json(result);
  }),
);

router.get(
  "/settings/:key",
  asyncHandler(async (req, res): Promise<void> => {
    const key = req.params.key as SettingKey;
    if (!VALID_KEYS.includes(key)) {
      throw new ApiError(
        400,
        "INVALID_KEY",
        `Invalid settings key. Valid keys: ${VALID_KEYS.join(", ")}`
      );
    }
    const [row] = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, key));
    res.json(row?.value ?? {});
  }),
);

router.put(
  "/settings/:key",
  asyncHandler(async (req, res): Promise<void> => {
    const key = req.params.key as SettingKey;
    if (!VALID_KEYS.includes(key)) {
      throw new ApiError(
        400,
        "INVALID_KEY",
        `Invalid settings key. Valid keys: ${VALID_KEYS.join(", ")}`
      );
    }
    if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
      throw new ApiError(400, "INVALID_BODY", "Body must be a JSON object");
    }

    const [row] = await db
      .insert(settingsTable)
      .values({ key, value: req.body, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { value: req.body, updatedAt: new Date() },
      })
      .returning();

    void writeLog({
      category: "system",
      message: `Settings updated: ${key}`,
      metadata: { key },
    });
    res.json(row.value);
  }),
);

export default router;
