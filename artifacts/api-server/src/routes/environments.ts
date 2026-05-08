import { Router, type IRouter } from "express";
import { eq, inArray, and, desc } from "drizzle-orm";
import { db, environmentsTable, scanJobsTable, cryptoAssetsTable, findingsTable, environmentConnectionsTable } from "@workspace/db";
import {
  CreateEnvironmentBody,
  UpdateEnvironmentBody,
  GetEnvironmentParams,
  UpdateEnvironmentParams,
  DeleteEnvironmentParams,
  TriggerScanParams,
} from "@workspace/api-zod";
import { runScan, isScanRunning } from "../lib/scanner";
import { writeLog } from "../lib/writeLog";
import { scanEventBus, type ScanProgressEvent } from "../lib/scanEventBus";
import { asyncHandler, ApiError } from "../middlewares/errorHandler";
import { scanRateLimit } from "../lib/rateLimiter";

const router: IRouter = Router();

router.get(
  "/environments",
  asyncHandler(async (_req, res): Promise<void> => {
    const envs = await db
      .select()
      .from(environmentsTable)
      .orderBy(environmentsTable.createdAt);
    res.json(
      envs.map((e) => ({
        ...e,
        lastScannedAt: e.lastScannedAt?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
    );
  }),
);

router.post(
  "/environments",
  asyncHandler(async (req, res): Promise<void> => {
    const parsed = CreateEnvironmentBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }
    const [env] = await db
      .insert(environmentsTable)
      .values({
        ...parsed.data,
        status: "disconnected",
        assetCount: 0,
        riskScore: 0,
      })
      .returning();
    void writeLog({
      category: "environment",
      message: `Environment created: "${env.name}" (${env.type})`,
      environmentId: env.id,
      environmentName: env.name,
    });
    res.status(201).json({
      ...env,
      lastScannedAt: env.lastScannedAt?.toISOString() ?? null,
      createdAt: env.createdAt.toISOString(),
      updatedAt: env.updatedAt.toISOString(),
    });
  }),
);

router.get(
  "/environments/:id",
  asyncHandler(async (req, res): Promise<void> => {
    const params = GetEnvironmentParams.safeParse(req.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION_ERROR", params.error.message);
    }
    const [env] = await db
      .select()
      .from(environmentsTable)
      .where(eq(environmentsTable.id, params.data.id));
    if (!env) {
      throw new ApiError(404, "NOT_FOUND", "Environment not found");
    }
    res.json({
      ...env,
      lastScannedAt: env.lastScannedAt?.toISOString() ?? null,
      createdAt: env.createdAt.toISOString(),
      updatedAt: env.updatedAt.toISOString(),
    });
  }),
);

router.put(
  "/environments/:id",
  asyncHandler(async (req, res): Promise<void> => {
    const params = UpdateEnvironmentParams.safeParse(req.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION_ERROR", params.error.message);
    }
    const parsed = UpdateEnvironmentBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }
    const [env] = await db
      .update(environmentsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(environmentsTable.id, params.data.id))
      .returning();
    if (!env) {
      throw new ApiError(404, "NOT_FOUND", "Environment not found");
    }
    res.json({
      ...env,
      lastScannedAt: env.lastScannedAt?.toISOString() ?? null,
      createdAt: env.createdAt.toISOString(),
      updatedAt: env.updatedAt.toISOString(),
    });
  }),
);

router.delete(
  "/environments/:id",
  asyncHandler(async (req, res): Promise<void> => {
    const params = DeleteEnvironmentParams.safeParse(req.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION_ERROR", params.error.message);
    }

    const id = params.data.id;

    await db.transaction(async (tx) => {
      const assets = await tx
        .select({ id: cryptoAssetsTable.id })
        .from(cryptoAssetsTable)
        .where(eq(cryptoAssetsTable.environmentId, id));

      if (assets.length > 0) {
        await tx
          .delete(findingsTable)
          .where(inArray(findingsTable.assetId, assets.map((a) => a.id)));
      }

      await tx.delete(findingsTable).where(eq(findingsTable.environmentId, id));
      await tx.delete(cryptoAssetsTable).where(eq(cryptoAssetsTable.environmentId, id));
      await tx.delete(scanJobsTable).where(eq(scanJobsTable.environmentId, id));
      await tx.delete(environmentConnectionsTable).where(eq(environmentConnectionsTable.environmentId, id));
      await tx.delete(environmentsTable).where(eq(environmentsTable.id, id));
    });

    res.sendStatus(204);
  }),
);

router.post(
  "/environments/:id/scan",
  scanRateLimit,
  asyncHandler(async (req, res): Promise<void> => {
    const params = TriggerScanParams.safeParse(req.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION_ERROR", params.error.message);
    }

    const environmentId = params.data.id;

    // Check if environment exists
    const [env] = await db
      .select({ id: environmentsTable.id })
      .from(environmentsTable)
      .where(eq(environmentsTable.id, environmentId));

    if (!env) {
      throw new ApiError(404, "NOT_FOUND", "Environment not found");
    }

    // isScanRunning uses an in-memory set checked synchronously before any
    // await, making the check-and-set atomic within a single Node.js process.
    // The DB check below catches stale "running" jobs after a server restart.
    if (isScanRunning(environmentId)) {
      throw new ApiError(409, "SCAN_IN_PROGRESS", "A scan is already running for this environment.");
    }

    const [existingJob] = await db
      .select({ id: scanJobsTable.id })
      .from(scanJobsTable)
      .where(and(eq(scanJobsTable.environmentId, environmentId), eq(scanJobsTable.status, "running")))
      .limit(1);

    if (existingJob) {
      throw new ApiError(409, "SCAN_IN_PROGRESS", "A scan is already running for this environment. Please wait for it to complete.");
    }

    const jobId = await runScan(environmentId);
    const [scanJob] = await db
      .select({
        id: scanJobsTable.id,
        environmentId: scanJobsTable.environmentId,
        status: scanJobsTable.status,
        startedAt: scanJobsTable.startedAt,
        completedAt: scanJobsTable.completedAt,
        assetsDiscovered: scanJobsTable.assetsDiscovered,
        findingsGenerated: scanJobsTable.findingsGenerated,
        errorMessage: scanJobsTable.errorMessage,
        createdAt: scanJobsTable.createdAt,
        environmentName: environmentsTable.name,
      })
      .from(scanJobsTable)
      .innerJoin(
        environmentsTable,
        eq(scanJobsTable.environmentId, environmentsTable.id),
      )
      .where(eq(scanJobsTable.id, jobId));

    if (!scanJob) {
      throw new ApiError(
        500,
        "INTERNAL_ERROR",
        "Scan job not found after creation",
      );
    }
    res.status(201).json({
      ...scanJob,
      startedAt: scanJob.startedAt?.toISOString() ?? null,
      completedAt: scanJob.completedAt?.toISOString() ?? null,
      createdAt: scanJob.createdAt.toISOString(),
    });
  }),
);

router.get(
  "/environments/:id/scan-stream",
  asyncHandler(async (req, res): Promise<void> => {
    const params = GetEnvironmentParams.safeParse(req.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION_ERROR", params.error.message);
    }
    const id = params.data.id;

    const [envCheck] = await db
      .select({ id: environmentsTable.id })
      .from(environmentsTable)
      .where(eq(environmentsTable.id, id));
    if (!envCheck) {
      throw new ApiError(404, "NOT_FOUND", "Environment not found");
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send an initial snapshot if a scan is currently running for this environment
    const [activeJob] = await db
      .select({
        id: scanJobsTable.id,
        environmentId: scanJobsTable.environmentId,
        assetsDiscovered: scanJobsTable.assetsDiscovered,
        findingsGenerated: scanJobsTable.findingsGenerated,
      })
      .from(scanJobsTable)
      .where(
        and(
          eq(scanJobsTable.environmentId, id),
          eq(scanJobsTable.status, "running"),
        ),
      )
      .orderBy(desc(scanJobsTable.createdAt))
      .limit(1);

    if (activeJob) {
      const totalAssets = activeJob.assetsDiscovered ?? 0;
      const snapshot: ScanProgressEvent = {
        type: "asset_discovered",
        jobId: activeJob.id,
        environmentId: id,
        assetsDiscovered: activeJob.assetsDiscovered ?? 0,
        totalAssets,
        findingsGenerated: activeJob.findingsGenerated ?? 0,
      };
      res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    }

    function sendEvent(event: ScanProgressEvent) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    scanEventBus.onEnvironment(id, sendEvent);

    // Keepalive ping every 20s to prevent proxy timeouts on long scans
    const keepalive = setInterval(() => {
      res.write(": ping\n\n");
    }, 20_000);

    req.on("close", () => {
      clearInterval(keepalive);
      scanEventBus.offEnvironment(id, sendEvent);
    });
  }),
);

export default router;
