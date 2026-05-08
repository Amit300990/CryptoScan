export type AssetTemplate = {
  name: string;
  assetType: string;
  algorithm?: string | null;
  keyLength?: number | null;
  issuer?: string | null;
  subject?: string | null;
  expiresAt?: Date | null;
  riskLevel: string;
  riskReason?: string | null;
  remediationAdvice?: string | null;
  isQuantumSafe: boolean;
  location?: string | null;
  tags: string[];
};

export type AwsCredentials = {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  region?: string;
  accountId?: string;
};

export type AzureCredentials = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId?: string;
  vaultUrls?: string[];
};

export type GcpCredentials = {
  serviceAccountJson?: string;
  projectId: string;
  locations?: string[];
  keyRingIds?: string[];
};

export type OnPremHost = {
  host: string;
  port?: number;
  name?: string;
};

export type OnPremCredentials = {
  hosts: OnPremHost[];
};

export function assessCertificateRisk(
  algorithm: string | null | undefined,
  keyLength: number | null | undefined,
  expiresAt: Date | null | undefined,
): { riskLevel: string; riskReason: string | null; remediationAdvice: string | null; isQuantumSafe: boolean } {
  const issues: string[] = [];
  const advice: string[] = [];
  let maxRisk = "info";
  let isQuantumSafe = false;

  const riskOrder = ["info", "low", "medium", "high", "critical"];
  function elevate(r: string) {
    if (riskOrder.indexOf(r) > riskOrder.indexOf(maxRisk)) maxRisk = r;
  }

  const alg = (algorithm ?? "").toUpperCase();
  const kl = keyLength ?? 0;

  if (alg.includes("SHA1") || alg === "SHA1WITHRSA") {
    elevate("critical");
    issues.push("SHA-1 is cryptographically broken.");
    advice.push("Replace with SHA-256 or SHA-384 signed certificate.");
  }

  if (alg === "RSA" || alg.includes("RSA")) {
    isQuantumSafe = false;
    if (kl > 0 && kl < 2048) {
      elevate("critical");
      issues.push(`RSA-${kl} key is well below minimum security threshold.`);
      advice.push("Replace immediately with RSA-4096 or ECDSA P-384.");
    } else if (kl >= 2048 && kl < 3072) {
      elevate("high");
      issues.push(`RSA-${kl} is below the recommended 3072-bit minimum.`);
      advice.push("Re-issue with RSA-4096 or ECDSA P-384.");
    } else if (kl >= 3072 && kl < 4096) {
      elevate("medium");
      issues.push(`RSA-${kl} is quantum-vulnerable.`);
      advice.push("Plan migration to post-quantum algorithm.");
    } else if (kl >= 4096) {
      elevate("medium");
      issues.push("RSA-4096 is quantum-vulnerable.");
      advice.push("Plan migration to CRYSTALS-Dilithium or similar post-quantum algorithm.");
    }
  } else if (alg === "ECDSA" || alg.includes("EC") || alg.includes("ECDSA")) {
    isQuantumSafe = false;
    elevate("medium");
    issues.push("ECDSA is quantum-vulnerable but currently secure for classical threats.");
    advice.push("Plan migration to post-quantum algorithm when toolchain support is available.");
  } else if (alg.includes("AES-256") || alg.includes("ED25519")) {
    isQuantumSafe = true;
  }

  if (expiresAt) {
    const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000);
    if (daysLeft < 0) {
      elevate("critical");
      issues.push("Certificate has expired.");
      advice.push("Renew immediately.");
    } else if (daysLeft < 30) {
      elevate("critical");
      issues.push(`Certificate expires in ${daysLeft} day(s).`);
      advice.push("Renew immediately.");
    } else if (daysLeft < 60) {
      elevate("high");
      issues.push(`Certificate expires in ${daysLeft} days.`);
      advice.push("Renew certificate before expiry.");
    } else if (daysLeft < 90) {
      elevate("medium");
      issues.push(`Certificate expires in ${daysLeft} days.`);
      advice.push("Schedule certificate renewal.");
    }
  }

  return {
    riskLevel: maxRisk,
    riskReason: issues.length > 0 ? issues.join(" ") : null,
    remediationAdvice: advice.length > 0 ? advice.join(" ") : null,
    isQuantumSafe,
  };
}
