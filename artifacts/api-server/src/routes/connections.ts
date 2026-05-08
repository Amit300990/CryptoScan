import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, environmentConnectionsTable } from "@workspace/db";
import {
  ListConnectionsParams,
  CreateConnectionParams,
  CreateConnectionBody,
  UpdateConnectionParams,
  UpdateConnectionBody,
  DeleteConnectionParams,
  TestConnectionParams,
} from "@workspace/api-zod";
import { testConnection } from "../lib/scanner";
import { encryptCredentials, decryptCredentials, isEncryptionEnabled } from "../lib/credentials";
import { asyncHandler, ApiError } from "../middlewares/errorHandler";
import { logger } from "../lib/logger";

const router: IRouter = Router();

type ConnectionRow = InferSelectModel<typeof environmentConnectionsTable>;

const SECRET_FIELDS = new Set([
  "secretAccessKey",
  "clientSecret",
  "password",
  "serviceAccountJson",
]);

function redactCredentials(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    result[key] = SECRET_FIELDS.has(key) ? "••••••••" : value;
  }
  return result;
}

function parseConnection(c: ConnectionRow) {
  const rawCredentials = (() => {
    try {
      const decrypted = decryptCredentials(c.credentials);
      return JSON.parse(decrypted) as unknown;
    } catch (err) {
      logger.warn(
        { err, connectionId: c.id },
        "Failed to parse credentials - returning empty object",
      );
      return {};
    }
  })();
  return {
    ...c,
    credentials: redactCredentials(rawCredentials),
    lastTestedAt: c.lastTestedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

router.get(
  "/environments/:id/connections",
  asyncHandler(async (req, res): Promise<void> => {
    const params = ListConnectionsParams.safeParse(req.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION_ERROR", params.error.message);
    }

    const connections = await db
      .select()
      .from(environmentConnectionsTable)
      .where(eq(environmentConnectionsTable.environmentId, params.data.id))
      .orderBy(environmentConnectionsTable.createdAt);

    res.json(connections.map(parseConnection));
  }),
);

router.post(
  "/environments/:id/connections",
  asyncHandler(async (req, res): Promise<void> => {
    const params = CreateConnectionParams.safeParse(req.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION_ERROR", params.error.message);
    }
    const parsed = CreateConnectionBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }

    const credJson = JSON.stringify(parsed.data.credentials);
    const [connection] = await db
      .insert(environmentConnectionsTable)
      .values({
        environmentId: params.data.id,
        providerType: parsed.data.providerType,
        credentials: encryptCredentials(credJson),
        status: "inactive",
      })
      .returning();

    res.status(201).json(parseConnection(connection));
  }),
);

router.put(
  "/environments/:id/connections/:connectionId",
  asyncHandler(async (req, res): Promise<void> => {
    const params = UpdateConnectionParams.safeParse(req.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION_ERROR", params.error.message);
    }
    const parsed = UpdateConnectionBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }

    const credJson = JSON.stringify(parsed.data.credentials);
    const [connection] = await db
      .update(environmentConnectionsTable)
      .set({
        credentials: encryptCredentials(credJson),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(environmentConnectionsTable.id, params.data.connectionId),
          eq(environmentConnectionsTable.environmentId, params.data.id),
        ),
      )
      .returning();

    if (!connection) {
      throw new ApiError(404, "NOT_FOUND", "Connection not found");
    }
    res.json(parseConnection(connection));
  }),
);

router.delete(
  "/environments/:id/connections/:connectionId",
  asyncHandler(async (req, res): Promise<void> => {
    const params = DeleteConnectionParams.safeParse(req.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION_ERROR", params.error.message);
    }

    await db
      .delete(environmentConnectionsTable)
      .where(
        and(
          eq(environmentConnectionsTable.id, params.data.connectionId),
          eq(environmentConnectionsTable.environmentId, params.data.id),
        ),
      );

    res.sendStatus(204);
  }),
);

router.post(
  "/environments/:id/connections/:connectionId/test",
  asyncHandler(async (req, res): Promise<void> => {
    const params = TestConnectionParams.safeParse(req.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION_ERROR", params.error.message);
    }

    const [connection] = await db
      .select()
      .from(environmentConnectionsTable)
      .where(
        and(
          eq(environmentConnectionsTable.id, params.data.connectionId),
          eq(environmentConnectionsTable.environmentId, params.data.id),
        ),
      );

    if (!connection) {
      throw new ApiError(404, "NOT_FOUND", "Connection not found");
    }

    const result = await testConnection(params.data.id, params.data.connectionId);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  }),
);

export { isEncryptionEnabled };
export default router;
