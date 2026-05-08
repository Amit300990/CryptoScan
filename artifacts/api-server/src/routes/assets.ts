import { Router, type IRouter } from "express";
import { eq, and, ilike, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, cryptoAssetsTable, environmentsTable } from "@workspace/db";
import { ListAssetsQueryParams, GetAssetParams } from "@workspace/api-zod";
import { asyncHandler, ApiError } from "../middlewares/errorHandler";

const router: IRouter = Router();

type AssetRow = Pick<
  InferSelectModel<typeof cryptoAssetsTable>,
  | "id"
  | "environmentId"
  | "scanJobId"
  | "name"
  | "assetType"
  | "algorithm"
  | "keyLength"
  | "issuer"
  | "subject"
  | "expiresAt"
  | "riskLevel"
  | "riskReason"
  | "remediationAdvice"
  | "isQuantumSafe"
  | "location"
  | "tags"
  | "createdAt"
  | "updatedAt"
> & {
  environmentName: string;
  environmentType: string;
};

function parseAsset(a: AssetRow) {
  return {
    ...a,
    tags: (() => { try { return JSON.parse(a.tags); } catch { return []; } })(),
    expiresAt: a.expiresAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

router.get(
  "/assets",
  asyncHandler(async (req, res): Promise<void> => {
    const parsed = ListAssetsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }

    // Validate pagination to prevent resource exhaustion
    const { environmentId, assetType, riskLevel, search, page = 1, pageSize: rawPageSize = 50 } = parsed.data;
    const pageSize = Math.min(rawPageSize, 1000); // Cap at 1000 records per page

  const conditions = [];
  if (environmentId) conditions.push(eq(cryptoAssetsTable.environmentId, environmentId));
  if (assetType) conditions.push(eq(cryptoAssetsTable.assetType, assetType));
  if (riskLevel) conditions.push(eq(cryptoAssetsTable.riskLevel, riskLevel));
  if (search) conditions.push(ilike(cryptoAssetsTable.name, `%${search}%`));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cryptoAssetsTable)
    .where(whereClause);

  const total = countResult?.count ?? 0;
  const offset = ((page ?? 1) - 1) * (pageSize ?? 50);

  const assets = await db
    .select({
      id: cryptoAssetsTable.id,
      environmentId: cryptoAssetsTable.environmentId,
      scanJobId: cryptoAssetsTable.scanJobId,
      name: cryptoAssetsTable.name,
      assetType: cryptoAssetsTable.assetType,
      algorithm: cryptoAssetsTable.algorithm,
      keyLength: cryptoAssetsTable.keyLength,
      issuer: cryptoAssetsTable.issuer,
      subject: cryptoAssetsTable.subject,
      expiresAt: cryptoAssetsTable.expiresAt,
      riskLevel: cryptoAssetsTable.riskLevel,
      riskReason: cryptoAssetsTable.riskReason,
      remediationAdvice: cryptoAssetsTable.remediationAdvice,
      isQuantumSafe: cryptoAssetsTable.isQuantumSafe,
      location: cryptoAssetsTable.location,
      tags: cryptoAssetsTable.tags,
      createdAt: cryptoAssetsTable.createdAt,
      updatedAt: cryptoAssetsTable.updatedAt,
      environmentName: environmentsTable.name,
      environmentType: environmentsTable.type,
    })
    .from(cryptoAssetsTable)
    .innerJoin(environmentsTable, eq(cryptoAssetsTable.environmentId, environmentsTable.id))
    .where(whereClause)
    .limit(pageSize ?? 50)
    .offset(offset);

    res.json({
      assets: assets.map(parseAsset),
      total,
      page: page ?? 1,
      pageSize,
    });
  }),
);

router.get(
  "/assets/:id",
  asyncHandler(async (req, res): Promise<void> => {
    const params = GetAssetParams.safeParse(req.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION_ERROR", params.error.message);
    }

    const [asset] = await db
    .select({
      id: cryptoAssetsTable.id,
      environmentId: cryptoAssetsTable.environmentId,
      scanJobId: cryptoAssetsTable.scanJobId,
      name: cryptoAssetsTable.name,
      assetType: cryptoAssetsTable.assetType,
      algorithm: cryptoAssetsTable.algorithm,
      keyLength: cryptoAssetsTable.keyLength,
      issuer: cryptoAssetsTable.issuer,
      subject: cryptoAssetsTable.subject,
      expiresAt: cryptoAssetsTable.expiresAt,
      riskLevel: cryptoAssetsTable.riskLevel,
      riskReason: cryptoAssetsTable.riskReason,
      remediationAdvice: cryptoAssetsTable.remediationAdvice,
      isQuantumSafe: cryptoAssetsTable.isQuantumSafe,
      location: cryptoAssetsTable.location,
      tags: cryptoAssetsTable.tags,
      createdAt: cryptoAssetsTable.createdAt,
      updatedAt: cryptoAssetsTable.updatedAt,
      environmentName: environmentsTable.name,
      environmentType: environmentsTable.type,
    })
    .from(cryptoAssetsTable)
    .innerJoin(environmentsTable, eq(cryptoAssetsTable.environmentId, environmentsTable.id))
      .where(eq(cryptoAssetsTable.id, params.data.id));

    if (!asset) {
      throw new ApiError(404, "NOT_FOUND", "Asset not found");
    }
    res.json(parseAsset(asset));
  }),
);

export default router;
