import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import type { InferSelectModel, SQL } from "drizzle-orm";
import { db, findingsTable, cryptoAssetsTable, environmentsTable, policyRulesTable } from "@workspace/db";
import { ListFindingsQueryParams, GetFindingParams, UpdateFindingParams, UpdateFindingBody } from "@workspace/api-zod";
import { asyncHandler, ApiError } from "../middlewares/errorHandler";

const router: IRouter = Router();

type FindingRow = Pick<
  InferSelectModel<typeof findingsTable>,
  | "id"
  | "assetId"
  | "environmentId"
  | "policyId"
  | "title"
  | "description"
  | "severity"
  | "status"
  | "remediationAdvice"
  | "detectedAt"
  | "resolvedAt"
> & {
  assetName: string;
  environmentName: string;
  policyName: string | null;
};

function parseFinding(f: FindingRow) {
  return {
    ...f,
    detectedAt: f.detectedAt instanceof Date ? f.detectedAt.toISOString() : f.detectedAt,
    resolvedAt: f.resolvedAt instanceof Date ? f.resolvedAt.toISOString() : (f.resolvedAt ?? null),
  };
}

async function findingsWithJoins(whereClause?: SQL, limit = 500, offset = 0): Promise<FindingRow[]> {
  const rows = await db
    .select({
      id: findingsTable.id,
      assetId: findingsTable.assetId,
      environmentId: findingsTable.environmentId,
      policyId: findingsTable.policyId,
      title: findingsTable.title,
      description: findingsTable.description,
      severity: findingsTable.severity,
      status: findingsTable.status,
      remediationAdvice: findingsTable.remediationAdvice,
      detectedAt: findingsTable.detectedAt,
      resolvedAt: findingsTable.resolvedAt,
      assetName: cryptoAssetsTable.name,
      environmentName: environmentsTable.name,
      policyName: policyRulesTable.name,
    })
    .from(findingsTable)
    .innerJoin(cryptoAssetsTable, eq(findingsTable.assetId, cryptoAssetsTable.id))
    .innerJoin(environmentsTable, eq(findingsTable.environmentId, environmentsTable.id))
    .leftJoin(policyRulesTable, eq(findingsTable.policyId, policyRulesTable.id))
    .where(whereClause)
    .orderBy(desc(findingsTable.detectedAt))
    .limit(Math.min(limit, 1000))
    .offset(offset);
  return rows;
}

router.get(
  "/findings",
  asyncHandler(async (req, res): Promise<void> => {
    const parsed = ListFindingsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }

    const conditions = [];
    if (parsed.data.environmentId)
      conditions.push(eq(findingsTable.environmentId, parsed.data.environmentId));
    if (parsed.data.severity) conditions.push(eq(findingsTable.severity, parsed.data.severity));
    if (parsed.data.status) conditions.push(eq(findingsTable.status, parsed.data.status));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(Number(req.query.pageSize ?? 500), 1000);
    const offset = (page - 1) * pageSize;
    const rows = await findingsWithJoins(whereClause, pageSize, offset);
    res.json(rows.map(parseFinding));
  }),
);

router.get(
  "/findings/:id",
  asyncHandler(async (req, res): Promise<void> => {
    const params = GetFindingParams.safeParse(req.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION_ERROR", params.error.message);
    }
    const rows = await findingsWithJoins(eq(findingsTable.id, params.data.id));
    if (!rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "Finding not found");
    }
    res.json(parseFinding(rows[0]));
  }),
);

router.put(
  "/findings/:id",
  asyncHandler(async (req, res): Promise<void> => {
    const params = UpdateFindingParams.safeParse(req.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION_ERROR", params.error.message);
    }
    const parsed = UpdateFindingBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }

    type UpdatePayload = {
      status?: "open" | "acknowledged" | "resolved" | "suppressed";
      resolvedAt?: Date | null;
    };
    const updates: UpdatePayload = { ...parsed.data };
    if (parsed.data.status === "resolved") {
      updates.resolvedAt = new Date();
    } else if (
      parsed.data.status === "open" ||
      parsed.data.status === "acknowledged" ||
      parsed.data.status === "suppressed"
    ) {
      updates.resolvedAt = null;
    }

    const [updated] = await db.update(findingsTable).set(updates).where(eq(findingsTable.id, params.data.id)).returning({ id: findingsTable.id });
    if (!updated) {
      throw new ApiError(404, "NOT_FOUND", "Finding not found");
    }
    const rows = await findingsWithJoins(eq(findingsTable.id, params.data.id));
    if (!rows[0]) {
      throw new ApiError(404, "NOT_FOUND", "Finding not found");
    }
    res.json(parseFinding(rows[0]));
  }),
);

export default router;
