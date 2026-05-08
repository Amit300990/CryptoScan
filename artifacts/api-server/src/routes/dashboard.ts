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
    const now = new Date();
    const in30 = new Date(now); in30.setDate(now.getDate() + 30);
    const in90 = new Date(now); in90.setDate(now.getDate() + 90);

    const [
      [assetCount],
      [envCount],
      [activeEnvCount],
      findingCounts,
      [exp30],
      [exp90],
      quantumCounts,
      envRisks,
      [lastScan],
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(cryptoAssetsTable),
      db.select({ count: sql<number>`count(*)::int` }).from(environmentsTable),
      db.select({ count: sql<number>`count(*)::int` }).from(environmentsTable).where(eq(environmentsTable.status, "connected")),
      db.select({ severity: findingsTable.severity, count: sql<number>`count(*)::int` }).from(findingsTable).where(eq(findingsTable.status, "open")).groupBy(findingsTable.severity),
      db.select({ count: sql<number>`count(*)::int` }).from(cryptoAssetsTable).where(and(lt(cryptoAssetsTable.expiresAt, in30), gt(cryptoAssetsTable.expiresAt, now))),
      db.select({ count: sql<number>`count(*)::int` }).from(cryptoAssetsTable).where(and(lt(cryptoAssetsTable.expiresAt, in90), gt(cryptoAssetsTable.expiresAt, now))),
      db.select({ isQuantumSafe: cryptoAssetsTable.isQuantumSafe, count: sql<number>`count(*)::int` }).from(cryptoAssetsTable).groupBy(cryptoAssetsTable.isQuantumSafe),
      db.select({ riskScore: environmentsTable.riskScore }).from(environmentsTable),
      db.select({ completedAt: scanJobsTable.completedAt }).from(scanJobsTable).where(eq(scanJobsTable.status, "completed")).orderBy(sql`${scanJobsTable.completedAt} desc`).limit(1),
    ]);

    const counts = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
    for (const f of findingCounts) {
      counts[f.severity as keyof typeof counts] = f.count;
      counts.total += f.count;
    }

    const qsSafe = quantumCounts.find((q) => q.isQuantumSafe)?.count ?? 0;
    const qsVuln = quantumCounts.find((q) => !q.isQuantumSafe)?.count ?? 0;
    const overallRisk = envRisks.length > 0
      ? Math.round(envRisks.reduce((sum, e) => sum + e.riskScore, 0) / envRisks.length)
      : 0;

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
      quantumSafeAssets: qsSafe,
      quantumVulnerableAssets: qsVuln,
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
    const [aggRows, vulnAlgoRows, safeAlgoRows] = await Promise.all([
      db.select({ isQuantumSafe: cryptoAssetsTable.isQuantumSafe, count: sql<number>`count(*)::int` })
        .from(cryptoAssetsTable)
        .groupBy(cryptoAssetsTable.isQuantumSafe),
      db.select({ algorithm: cryptoAssetsTable.algorithm })
        .from(cryptoAssetsTable)
        .where(eq(cryptoAssetsTable.isQuantumSafe, false))
        .groupBy(cryptoAssetsTable.algorithm)
        .limit(10),
      db.select({ algorithm: cryptoAssetsTable.algorithm })
        .from(cryptoAssetsTable)
        .where(eq(cryptoAssetsTable.isQuantumSafe, true))
        .groupBy(cryptoAssetsTable.algorithm),
    ]);

    const safeCount = aggRows.find((r) => r.isQuantumSafe)?.count ?? 0;
    const vulnCount = aggRows.find((r) => !r.isQuantumSafe)?.count ?? 0;
    const total = safeCount + vulnCount;

    const vulnAlgos = vulnAlgoRows.map((r) => r.algorithm).filter((a): a is string => a !== null);
    const safeAlgos = safeAlgoRows.map((r) => r.algorithm).filter((a): a is string => a !== null);

    const readinessScore = total > 0 ? Math.round((safeCount / total) * 100) : 0;

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
