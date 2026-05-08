import { db } from "@workspace/db";
import {
  environmentsTable,
  scanJobsTable,
  cryptoAssetsTable,
  findingsTable,
  environmentConnectionsTable,
} from "@workspace/db";
import { eq, inArray, and, desc } from "drizzle-orm";
import { logger } from "./logger";
import { writeLog } from "./writeLog";
import { scanEventBus } from "./scanEventBus";
import { scanAws } from "./scanners/aws";
import { scanAzure } from "./scanners/azure";
import { scanGcp } from "./scanners/gcp";
import { scanOnPrem } from "./scanners/onprem";
import { scanVmware } from "./scanners/vmware";
import { decryptCredentials } from "./credentials";
import type {
  AssetTemplate,
  AwsCredentials,
  AzureCredentials,
  GcpCredentials,
  OnPremCredentials,
} from "./scanners/types";

export type { AssetTemplate };

function computeRiskScore(riskLevels: string[]): number {
  let score = 0;
  for (const level of riskLevels) {
    switch (level) {
      case "critical": score += 25; break;
      case "high": score += 15; break;
      case "medium": score += 7; break;
      case "low": score += 2; break;
    }
  }
  return Math.min(score, 100);
}

function generateFindingForAsset(asset: AssetTemplate): { title: string; description: string; severity: string; remediationAdvice: string } | null {
  if (!asset.riskReason || asset.riskLevel === "info" || asset.riskLevel === "low") return null;
  return {
    title: `${asset.riskLevel.toUpperCase()}: ${asset.name} — ${asset.riskLevel === "critical" ? "Critical Risk" : "Security Finding"}`,
    description: asset.riskReason,
    severity: asset.riskLevel === "medium" ? "medium" : asset.riskLevel,
    remediationAdvice: asset.remediationAdvice ?? "Review and remediate according to security best practices.",
  };
}

async function getConnectionCredentials(environmentId: number): Promise<Record<string, unknown>> {
  const [connection] = await db
    .select()
    .from(environmentConnectionsTable)
    .where(
      and(
        eq(environmentConnectionsTable.environmentId, environmentId),
        eq(environmentConnectionsTable.status, "active"),
      ),
    )
    .orderBy(desc(environmentConnectionsTable.updatedAt))
    .limit(1);

  if (!connection) {
    const [anyConnection] = await db
      .select()
      .from(environmentConnectionsTable)
      .where(eq(environmentConnectionsTable.environmentId, environmentId))
      .orderBy(desc(environmentConnectionsTable.updatedAt))
      .limit(1);

    if (anyConnection) {
      try {
        return JSON.parse(decryptCredentials(anyConnection.credentials)) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return {};
  }

  try {
    return JSON.parse(decryptCredentials(connection.credentials)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function discoverAssets(envType: string, credentials: Record<string, unknown>): Promise<AssetTemplate[]> {
  switch (envType) {
    case "aws":
      return scanAws(credentials as unknown as AwsCredentials);

    case "azure":
      return scanAzure(credentials as unknown as AzureCredentials);

    case "gcp":
      return scanGcp(credentials as unknown as GcpCredentials);

    case "on_premises":
      return scanOnPrem(credentials as unknown as OnPremCredentials);

    case "vmware":
      return scanVmware(credentials as Record<string, string | boolean | undefined>);

    default:
      throw new Error(`Unsupported environment type: ${envType}`);
  }
}

export async function testConnection(environmentId: number, connectionId: number): Promise<{ success: boolean; message: string; latencyMs: number }> {
  const [connection] = await db
    .select()
    .from(environmentConnectionsTable)
    .where(
      and(
        eq(environmentConnectionsTable.id, connectionId),
        eq(environmentConnectionsTable.environmentId, environmentId),
      ),
    );

  if (!connection) {
    return { success: false, message: "Connection record not found.", latencyMs: 0 };
  }

  const [env] = await db
    .select({ type: environmentsTable.type })
    .from(environmentsTable)
    .where(eq(environmentsTable.id, environmentId));

  if (!env) {
    return { success: false, message: "Environment not found.", latencyMs: 0 };
  }

  let credentials: Record<string, unknown> = {};
  try {
    credentials = JSON.parse(decryptCredentials(connection.credentials)) as Record<string, unknown>;
  } catch {
    return { success: false, message: "Invalid credentials stored for this connection. If encryption is enabled, ensure CREDENTIAL_ENCRYPTION_KEY is set correctly.", latencyMs: 0 };
  }

  const start = Date.now();
  try {
    switch (env.type) {
      case "aws": {
        const { ACMClient, ListCertificatesCommand } = await import("@aws-sdk/client-acm");
        const creds = credentials as AwsCredentials;
        const cfg = creds.accessKeyId && creds.secretAccessKey
          ? { region: creds.region ?? "us-east-1", credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey, ...(creds.sessionToken ? { sessionToken: creds.sessionToken } : {}) } }
          : { region: creds.region ?? "us-east-1" };
        const client = new ACMClient(cfg);
        await client.send(new ListCertificatesCommand({ MaxItems: 1 }));
        break;
      }
      case "azure": {
        const { ClientSecretCredential } = await import("@azure/identity");
        const { CertificateClient } = await import("@azure/keyvault-certificates");
        const creds = credentials as AzureCredentials;
        if (!creds.tenantId || !creds.clientId || !creds.clientSecret) {
          throw new Error("Azure credentials require tenantId, clientId, and clientSecret.");
        }
        const vaultUrls = creds.vaultUrls ?? [];
        if (vaultUrls.length === 0) {
          throw new Error("At least one vaultUrl is required for Azure connections.");
        }
        const credential = new ClientSecretCredential(creds.tenantId, creds.clientId, creds.clientSecret);
        const client = new CertificateClient(vaultUrls[0], credential);
        const iter = client.listPropertiesOfCertificates();
        await iter.next();
        break;
      }
      case "gcp": {
        const { KeyManagementServiceClient } = await import("@google-cloud/kms");
        const creds = credentials as GcpCredentials;
        if (!creds.projectId) throw new Error("GCP credentials require projectId.");
        const opts = creds.serviceAccountJson
          ? { credentials: JSON.parse(creds.serviceAccountJson) as Record<string, string>, projectId: creds.projectId }
          : { projectId: creds.projectId };
        const client = new KeyManagementServiceClient(opts);
        await client.listKeyRings({ parent: `projects/${creds.projectId}/locations/global` });
        break;
      }
      case "on_premises": {
        const creds = credentials as OnPremCredentials;
        if (!creds.hosts || creds.hosts.length === 0) {
          throw new Error("On-premises connection requires at least one host in the credentials.");
        }
        const tls = await import("tls");
        const firstHost = creds.hosts[0];
        await new Promise<void>((resolve, reject) => {
          const socket = tls.connect({ host: firstHost.host, port: firstHost.port ?? 443, rejectUnauthorized: false, timeout: 8000 }, () => {
            socket.destroy();
            resolve();
          });
          socket.on("error", reject);
          socket.setTimeout(8000, () => { socket.destroy(); reject(new Error("Connection timed out")); });
        });
        break;
      }
      case "vmware": {
        break;
      }
      default:
        throw new Error(`Unsupported environment type: ${env.type}`);
    }

    const latencyMs = Date.now() - start;
    await db.update(environmentConnectionsTable).set({ status: "active", lastTestedAt: new Date(), errorMessage: null, updatedAt: new Date() }).where(eq(environmentConnectionsTable.id, connectionId));
    return { success: true, message: "Connection verified successfully.", latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db.update(environmentConnectionsTable).set({ status: "inactive", errorMessage, updatedAt: new Date() }).where(eq(environmentConnectionsTable.id, connectionId));
    return { success: false, message: errorMessage, latencyMs };
  }
}

export async function runScan(environmentId: number): Promise<number> {
  const [env] = await db.select().from(environmentsTable).where(eq(environmentsTable.id, environmentId));
  if (!env) throw new Error(`Environment ${environmentId} not found`);

  const [job] = await db
    .insert(scanJobsTable)
    .values({
      environmentId,
      status: "running",
      startedAt: new Date(),
      assetsDiscovered: 0,
      findingsGenerated: 0,
    })
    .returning();

  await db.update(environmentsTable).set({ status: "scanning" }).where(eq(environmentsTable.id, environmentId));

  await writeLog({
    category: "scan",
    message: `Scan started for environment "${env.name}" (${env.type})`,
    environmentId,
    environmentName: env.name,
    metadata: { jobId: job.id, environmentType: env.type },
  });

  void (async () => {
    let assetTemplates: AssetTemplate[] = [];
    let findingsCount = 0;
    const insertedAssets: { id: number }[] = [];

    try {
      const credentials = await getConnectionCredentials(environmentId);
      assetTemplates = await discoverAssets(env.type, credentials);

      const previousAssets = await db
        .select({ id: cryptoAssetsTable.id })
        .from(cryptoAssetsTable)
        .where(eq(cryptoAssetsTable.environmentId, environmentId));

      if (previousAssets.length > 0) {
        const previousAssetIds = previousAssets.map((a) => a.id);
        await db.delete(findingsTable).where(inArray(findingsTable.assetId, previousAssetIds));
        await db.delete(cryptoAssetsTable).where(eq(cryptoAssetsTable.environmentId, environmentId));
      }

      const totalAssets = assetTemplates.length;

      for (let i = 0; i < assetTemplates.length; i++) {
        const a = assetTemplates[i];

        const [insertedAsset] = await db
          .insert(cryptoAssetsTable)
          .values({
            environmentId,
            scanJobId: job.id,
            name: a.name,
            assetType: a.assetType,
            algorithm: a.algorithm ?? null,
            keyLength: a.keyLength ?? null,
            issuer: a.issuer ?? null,
            subject: a.subject ?? null,
            expiresAt: a.expiresAt ?? null,
            riskLevel: a.riskLevel,
            riskReason: a.riskReason ?? null,
            remediationAdvice: a.remediationAdvice ?? null,
            isQuantumSafe: a.isQuantumSafe,
            location: a.location ?? null,
            tags: JSON.stringify(a.tags),
          })
          .returning();

        insertedAssets.push(insertedAsset);

        const finding = generateFindingForAsset(a);
        if (finding && (a.riskLevel === "critical" || a.riskLevel === "high" || a.riskLevel === "medium")) {
          await db.insert(findingsTable).values({
            assetId: insertedAsset.id,
            environmentId,
            title: finding.title,
            description: finding.description,
            severity: finding.severity,
            status: "open",
            remediationAdvice: finding.remediationAdvice,
            detectedAt: new Date(),
          });
          findingsCount++;

          scanEventBus.emitProgress({
            type: "finding_generated",
            jobId: job.id,
            environmentId,
            assetsDiscovered: insertedAssets.length,
            totalAssets,
            findingsGenerated: findingsCount,
            assetName: a.name,
          });
        } else {
          scanEventBus.emitProgress({
            type: "asset_discovered",
            jobId: job.id,
            environmentId,
            assetsDiscovered: insertedAssets.length,
            totalAssets,
            findingsGenerated: findingsCount,
            assetName: a.name,
          });
        }

        await db.update(scanJobsTable).set({
          assetsDiscovered: insertedAssets.length,
          findingsGenerated: findingsCount,
        }).where(eq(scanJobsTable.id, job.id));
      }

      const riskScore = computeRiskScore(assetTemplates.map((a) => a.riskLevel));

      await db.update(scanJobsTable).set({
        status: "completed",
        completedAt: new Date(),
        assetsDiscovered: insertedAssets.length,
        findingsGenerated: findingsCount,
      }).where(eq(scanJobsTable.id, job.id));

      await db.update(environmentsTable).set({
        status: "connected",
        lastScannedAt: new Date(),
        assetCount: insertedAssets.length,
        riskScore,
      }).where(eq(environmentsTable.id, environmentId));

      logger.info({ environmentId, assetsDiscovered: insertedAssets.length, findingsGenerated: findingsCount }, "Scan completed");

      await writeLog({
        category: "scan",
        message: `Scan completed for "${env.name}": ${insertedAssets.length} assets discovered, ${findingsCount} findings generated`,
        environmentId,
        environmentName: env.name,
        metadata: { jobId: job.id, assetsDiscovered: insertedAssets.length, findingsGenerated: findingsCount, riskScore },
      });

      scanEventBus.emitProgress({
        type: "scan_completed",
        jobId: job.id,
        environmentId,
        assetsDiscovered: insertedAssets.length,
        totalAssets: assetTemplates.length,
        findingsGenerated: findingsCount,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      await db.update(scanJobsTable).set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: errMsg,
      }).where(eq(scanJobsTable.id, job.id));
      await db.update(environmentsTable).set({ status: "error" }).where(eq(environmentsTable.id, environmentId));

      await writeLog({
        level: "error",
        category: "scan",
        message: `Scan failed for "${env.name}": ${errMsg}`,
        environmentId,
        environmentName: env.name,
        metadata: { jobId: job.id },
      });

      scanEventBus.emitProgress({
        type: "scan_failed",
        jobId: job.id,
        environmentId,
        assetsDiscovered: insertedAssets.length,
        totalAssets: assetTemplates.length,
        findingsGenerated: findingsCount,
        errorMessage: errMsg,
      });

      logger.error({ err, environmentId }, "Scan failed");
    }
  })();

  return job.id;
}
