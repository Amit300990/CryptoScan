import { db } from "@workspace/db";
import { environmentsTable, policyRulesTable } from "@workspace/db";
import { runScan } from "./scanner";
import { logger } from "./logger";

const DEFAULT_ENVIRONMENTS = [
  { name: "Acme Corp — On-Premises (HQ)", type: "on_premises" as const, region: "US East Coast DC", credentialHint: "SSH / LDAP / PKI Integration" },
  { name: "AWS Production (us-east-1)", type: "aws" as const, region: "us-east-1", credentialHint: "IAM Role: arn:aws:iam::123456789:role/CryptoScanner" },
  { name: "Azure East US", type: "azure" as const, region: "eastus", credentialHint: "Service Principal: app-crypto-scanner" },
  { name: "Google Cloud (us-central1)", type: "gcp" as const, region: "us-central1", credentialHint: "Service Account: crypto-scanner@acme.iam.gserviceaccount.com" },
  { name: "VMware vSphere (Private Cloud)", type: "vmware" as const, region: "Private DC — Rack A", credentialHint: "vCenter SSO: scanner@vsphere.local" },
];

const DEFAULT_POLICIES = [
  {
    name: "Reject SHA-1",
    description: "Flag any certificate or asset using SHA-1 as the hash algorithm. SHA-1 is cryptographically broken since 2017.",
    category: "algorithm" as const,
    severity: "critical" as const,
    ruleExpression: "algorithm == 'SHA1withRSA' || algorithm == 'SHA1withECDSA'",
    enabled: true,
  },
  {
    name: "Minimum RSA Key Length 2048",
    description: "Flag any RSA key with fewer than 2048 bits. NIST recommends 3072 bits for security beyond 2030.",
    category: "key_length" as const,
    severity: "critical" as const,
    ruleExpression: "algorithm == 'RSA' && keyLength < 2048",
    enabled: true,
  },
  {
    name: "RSA Key Length < 3072 (Warning)",
    description: "Warn on RSA keys below 3072 bits. Keys between 2048–3071 bits will become insufficient after 2030.",
    category: "key_length" as const,
    severity: "medium" as const,
    ruleExpression: "algorithm == 'RSA' && keyLength < 3072",
    enabled: true,
  },
  {
    name: "Certificate Expiry — 30 Days",
    description: "Flag certificates expiring within 30 days as critical. Expired certificates cause service outages.",
    category: "expiry" as const,
    severity: "critical" as const,
    ruleExpression: "assetType == 'certificate' && daysUntilExpiry < 30",
    enabled: true,
  },
  {
    name: "Certificate Expiry — 90 Days",
    description: "Warn on certificates expiring within 90 days. Plan renewal before the 30-day critical threshold.",
    category: "expiry" as const,
    severity: "medium" as const,
    ruleExpression: "assetType == 'certificate' && daysUntilExpiry < 90",
    enabled: true,
  },
  {
    name: "Reject TLS 1.0",
    description: "Flag any TLS configuration allowing TLS 1.0. Vulnerable to BEAST and POODLE attacks.",
    category: "protocol" as const,
    severity: "critical" as const,
    ruleExpression: "assetType == 'tls_config' && algorithm == 'TLSv1.0'",
    enabled: true,
  },
  {
    name: "Reject TLS 1.1",
    description: "Flag any TLS configuration allowing TLS 1.1. Deprecated per RFC 8996.",
    category: "protocol" as const,
    severity: "high" as const,
    ruleExpression: "assetType == 'tls_config' && algorithm == 'TLSv1.1'",
    enabled: true,
  },
  {
    name: "Post-Quantum Readiness",
    description: "Flag assets using quantum-vulnerable algorithms (RSA, ECDSA, DH, DSA). Plan migration to NIST PQC standards.",
    category: "quantum_readiness" as const,
    severity: "medium" as const,
    ruleExpression: "isQuantumSafe == false",
    enabled: false,
  },
  {
    name: "IAM Key Rotation — 90 Days",
    description: "Flag cloud IAM / service account signing keys not rotated within 90 days.",
    category: "key_length" as const,
    severity: "high" as const,
    ruleExpression: "keyAgeInDays > 90 && (assetType == 'asymmetric_key' || assetType == 'symmetric_key')",
    enabled: true,
  },
  {
    name: "Require AES-256 for Symmetric Encryption",
    description: "Flag symmetric keys below 256-bit length. AES-128 is insufficient for high-security workloads.",
    category: "key_length" as const,
    severity: "high" as const,
    ruleExpression: "assetType == 'symmetric_key' && keyLength < 256",
    enabled: true,
  },
];

export async function seedIfEmpty() {
  const existingEnvs = await db.select().from(environmentsTable);
  if (existingEnvs.length > 0) {
    logger.info("Database already seeded, skipping");
    return;
  }

  logger.info("Seeding database with default environments and policies...");

  const insertedEnvs = await db
    .insert(environmentsTable)
    .values(DEFAULT_ENVIRONMENTS.map((e) => ({ ...e, status: "disconnected", assetCount: 0, riskScore: 0 })))
    .returning();

  await db.insert(policyRulesTable).values(DEFAULT_POLICIES);

  logger.info("Running initial scans for all environments...");
  for (const env of insertedEnvs) {
    try {
      await runScan(env.id);
      logger.info({ environmentId: env.id, name: env.name }, "Scan completed for environment");
    } catch (err) {
      logger.error({ err, environmentId: env.id }, "Scan failed for environment during seed");
    }
  }

  logger.info("Seeding complete");
}
