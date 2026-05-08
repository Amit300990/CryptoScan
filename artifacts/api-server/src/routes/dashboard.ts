import { Router, type IRouter } from "express";
import { eq, sql, and, lt, gt } from "drizzle-orm";
import {
  db,
  environmentsTable,
  cryptoAssetsTable,
  findingsTable,
  scanJobsTable,
} from "@workspace/db";
import { GetExpiringCertsQueryParams } from "@workspace/api-zod";
import { asyncHandler, ApiError } from "../middlewares/errorHandler";

const router: IRouter = Router();

router.get(
  "/dashboard/summary",
  asyncHandler(async (_req, res): Promise<void> => {
  const [assetCount] = await db.select({ count: sql<number>`count(*)::int` }).from(cryptoAssetsTable);
  const [envCount] = await db.select({ count: sql<number>`count(*)::int` }).from(environmentsTable);
  const [activeEnvCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(environmentsTable)
    .where(eq(environmentsTable.status, "connected"));

  const findingCounts = await db
    .select({ severity: findingsTable.severity, count: sql<number>`count(*)::int` })
    .from(findingsTable)
    .where(eq(findingsTable.status, "open"))
    .groupBy(findingsTable.severity);

  const counts = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  for (const f of findingCounts) {
    counts[f.severity as keyof typeof counts] = f.count;
    counts.total += f.count;
  }

  const now = new Date();
  const in30 = new Date(now); in30.setDate(now.getDate() + 30);
  const in90 = new Date(now); in90.setDate(now.getDate() + 90);

  const [exp30] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cryptoAssetsTable)
    .where(and(lt(cryptoAssetsTable.expiresAt, in30), gt(cryptoAssetsTable.expiresAt, now)));

  const [exp90] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cryptoAssetsTable)
    .where(and(lt(cryptoAssetsTable.expiresAt, in90), gt(cryptoAssetsTable.expiresAt, now)));

  const [qsSafe] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cryptoAssetsTable)
    .where(eq(cryptoAssetsTable.isQuantumSafe, true));

  const [qsVuln] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cryptoAssetsTable)
    .where(eq(cryptoAssetsTable.isQuantumSafe, false));

  const envs = await db.select({ riskScore: environmentsTable.riskScore }).from(environmentsTable);
  const overallRisk = envs.length > 0
    ? Math.round(envs.reduce((sum, e) => sum + e.riskScore, 0) / envs.length)
    : 0;

  const [lastScan] = await db
    .select({ completedAt: scanJobsTable.completedAt })
    .from(scanJobsTable)
    .where(eq(scanJobsTable.status, "completed"))
    .orderBy(sql`${scanJobsTable.completedAt} desc`)
    .limit(1);

  res.json({
    totalAssets: assetCount?.count ?? 0,
    totalEnvironments: envCount?.count ?? 0,
    activeEnvironments: activeEnvCount?.count ?? 0,
    totalFindings: counts.total,
    criticalFindings: counts.critical,
    highFindings: counts.high,
    mediumFindings: counts.medium,
    lowFindings: counts.low,
    expiringIn30Days: exp30?.count ?? 0,
    expiringIn90Days: exp90?.count ?? 0,
    quantumSafeAssets: qsSafe?.count ?? 0,
    quantumVulnerableAssets: qsVuln?.count ?? 0,
    overallRiskScore: overallRisk,
    lastScanAt: lastScan?.completedAt?.toISOString() ?? null,
  });
  }),
);

router.get(
  "/dashboard/risk-by-environment",
  asyncHandler(async (_req, res): Promise<void> => {
    const envs = await db
      .select({
        id: environmentsTable.id,
        name: environmentsTable.name,
        type: environmentsTable.type,
        riskScore: environmentsTable.riskScore,
        assetCount: environmentsTable.assetCount,
      })
      .from(environmentsTable)
      .orderBy(environmentsTable.riskScore);

    const severityAgg = await db
      .select({
        environmentId: findingsTable.environmentId,
        severity: findingsTable.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(findingsTable)
      .where(eq(findingsTable.status, "open"))
      .groupBy(findingsTable.environmentId, findingsTable.severity);

    const byEnv = new Map<number, { critical: number; high: number }>();
    for (const row of severityAgg) {
      const entry = byEnv.get(row.environmentId) ?? { critical: 0, high: 0 };
      if (row.severity === "critical") entry.critical = row.count;
      if (row.severity === "high") entry.high = row.count;
      byEnv.set(row.environmentId, entry);
    }

    res.json(
      envs.map((env) => {
        const counts = byEnv.get(env.id) ?? { critical: 0, high: 0 };
        return {
          environmentId: env.id,
          environmentName: env.name,
          environmentType: env.type,
          riskScore: env.riskScore,
          assetCount: env.assetCount,
          criticalCount: counts.critical,
          highCount: counts.high,
        };
      }),
    );
  }),
);

router.get(
  "/dashboard/assets-by-type",
  asyncHandler(async (_req, res): Promise<void> => {
    const typeCounts = await db
      .select({ assetType: cryptoAssetsTable.assetType, count: sql<number>`count(*)::int` })
      .from(cryptoAssetsTable)
      .groupBy(cryptoAssetsTable.assetType);

    const severityAgg = await db
      .select({
        assetType: cryptoAssetsTable.assetType,
        severity: findingsTable.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(findingsTable)
      .innerJoin(cryptoAssetsTable, eq(findingsTable.assetId, cryptoAssetsTable.id))
      .where(eq(findingsTable.status, "open"))
      .groupBy(cryptoAssetsTable.assetType, findingsTable.severity);

    const byType = new Map<string, { critical: number; high: number }>();
    for (const row of severityAgg) {
      const entry = byType.get(row.assetType) ?? { critical: 0, high: 0 };
      if (row.severity === "critical") entry.critical = row.count;
      if (row.severity === "high") entry.high = row.count;
      byType.set(row.assetType, entry);
    }

    res.json(
      typeCounts.map((t) => {
        const counts = byType.get(t.assetType) ?? { critical: 0, high: 0 };
        return {
          assetType: t.assetType,
          count: t.count,
          criticalCount: counts.critical,
          highCount: counts.high,
        };
      }),
    );
  }),
);

router.get(
  "/dashboard/expiring-certs",
  asyncHandler(async (req, res): Promise<void> => {
    const parsed = GetExpiringCertsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }

  const days = parsed.data.days ?? 90;
  const now = new Date();
  const threshold = new Date(now);
  threshold.setDate(now.getDate() + days);

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
    .where(and(eq(cryptoAssetsTable.assetType, "certificate"), lt(cryptoAssetsTable.expiresAt, threshold), gt(cryptoAssetsTable.expiresAt, now)))
    .orderBy(cryptoAssetsTable.expiresAt);

  res.json(assets.map((a) => ({
    ...a,
    tags: (() => { try { return JSON.parse(a.tags); } catch { return []; } })(),
    expiresAt: a.expiresAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  })));
  }),
);

router.get(
  "/dashboard/quantum-readiness",
  asyncHandler(async (_req, res): Promise<void> => {
    const assets = await db
      .select({
        algorithm: cryptoAssetsTable.algorithm,
        isQuantumSafe: cryptoAssetsTable.isQuantumSafe,
      })
      .from(cryptoAssetsTable);

    const safeCount = assets.filter((a) => a.isQuantumSafe).length;
    const vulnCount = assets.filter((a) => !a.isQuantumSafe).length;

    const vulnAlgos = [
      ...new Set(
        assets
          .filter((a) => !a.isQuantumSafe && a.algorithm)
          .map((a) => a.algorithm as string),
      ),
    ].slice(0, 10);

    const safeAlgos = [
      ...new Set(
        assets
          .filter((a) => a.isQuantumSafe && a.algorithm)
          .map((a) => a.algorithm as string),
      ),
    ];

    const readinessScore =
      assets.length > 0 ? Math.round((safeCount / assets.length) * 100) : 0;

    res.json({
      readinessScore,
      quantumSafeCount: safeCount,
      vulnerableCount: vulnCount,
      vulnerableAlgorithms: vulnAlgos,
      safeAlgorithms: safeAlgos,
      recommendations: [
        "Inventory all RSA and ECDSA keys and certificates for post-quantum migration planning",
        "Migrate certificate authorities to CRYSTALS-Dilithium or SPHINCS+ by 2027",
        "Replace RSA key encapsulation with CRYSTALS-Kyber (FIPS 203) for encryption",
        "Prioritize quantum migration for long-lived secrets and root CA certificates",
        "Adopt hybrid classical/post-quantum TLS where quantum-safe ciphers are not yet universally supported",
        "Enable AES-256-GCM for all symmetric encryption (already quantum-resistant against Grover's algorithm)",
      ],
    });
  }),
);

export default router;
