import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db, systemLogsTable } from "@workspace/db";
import { ListLogsQueryParams } from "@workspace/api-zod";
import { asyncHandler, ApiError } from "../middlewares/errorHandler";

const router: IRouter = Router();

router.get(
  "/logs",
  asyncHandler(async (req, res): Promise<void> => {
    const parsed = ListLogsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }

    const { level, category, environmentId, limit } = parsed.data;

    const conditions: SQL[] = [];
    if (level) conditions.push(eq(systemLogsTable.level, level));
    if (category) conditions.push(eq(systemLogsTable.category, category));
    if (environmentId) conditions.push(eq(systemLogsTable.environmentId, environmentId));

    const rows = await db
      .select()
      .from(systemLogsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(systemLogsTable.createdAt))
      .limit(Math.min(limit ?? 200, 1000));

    res.json(
      rows.map((r) => ({
        ...r,
        metadata: (() => {
          try {
            return r.metadata ? JSON.parse(r.metadata) : null;
          } catch {
            return null;
          }
        })(),
        createdAt: r.createdAt.toISOString(),
      })),
    );
  }),
);

export default router;
