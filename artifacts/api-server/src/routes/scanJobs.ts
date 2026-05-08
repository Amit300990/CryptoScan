import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, scanJobsTable, environmentsTable } from "@workspace/db";
import { ListScanJobsQueryParams, GetScanJobParams } from "@workspace/api-zod";
import { asyncHandler, ApiError } from "../middlewares/errorHandler";

const router: IRouter = Router();

router.get(
  "/scan-jobs",
  asyncHandler(async (req, res): Promise<void> => {
    const parsed = ListScanJobsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }

  let jobs;
  if (parsed.data.environmentId) {
    jobs = await db
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
      .innerJoin(environmentsTable, eq(scanJobsTable.environmentId, environmentsTable.id))
      .where(eq(scanJobsTable.environmentId, parsed.data.environmentId))
      .orderBy(scanJobsTable.createdAt);
  } else {
    jobs = await db
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
      .innerJoin(environmentsTable, eq(scanJobsTable.environmentId, environmentsTable.id))
      .orderBy(scanJobsTable.createdAt);
  }

    res.json(jobs.map((j) => ({
      ...j,
      startedAt: j.startedAt?.toISOString() ?? null,
      completedAt: j.completedAt?.toISOString() ?? null,
      createdAt: j.createdAt.toISOString(),
    })));
  }),
);

router.get(
  "/scan-jobs/:id",
  asyncHandler(async (req, res): Promise<void> => {
    const params = GetScanJobParams.safeParse(req.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION_ERROR", params.error.message);
    }

  const [job] = await db
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
    .innerJoin(environmentsTable, eq(scanJobsTable.environmentId, environmentsTable.id))
    .where(eq(scanJobsTable.id, params.data.id));

  if (!job) {
    throw new ApiError(404, "NOT_FOUND", "Scan job not found");
  }
  res.json({
    ...job,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
  });
  }),
);

export default router;
