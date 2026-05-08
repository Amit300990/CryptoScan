import { KeyManagementServiceClient } from "@google-cloud/kms";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { type GcpCredentials, type AssetTemplate } from "./types";

type GcpClientOptions = {
  projectId: string;
  credentials?: Record<string, string>;
};

function makeClientOptions(creds: GcpCredentials): GcpClientOptions {
  if (creds.serviceAccountJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(creds.serviceAccountJson);
    } catch {
      throw new Error("Invalid serviceAccountJson: must be valid JSON.");
    }
    return { credentials: parsed as Record<string, string>, projectId: creds.projectId };
  }
  return { projectId: creds.projectId };
}

export async function scanGcp(creds: GcpCredentials): Promise<AssetTemplate[]> {
  if (!creds.projectId) {
    throw new Error("GCP projectId is required in the connection credentials.");
  }

  const clientOptions = makeClientOptions(creds);
  const assets: AssetTemplate[] = [];

  await Promise.all([
    scanCloudKms(creds, clientOptions, assets),
    scanSecretManager(creds, clientOptions, assets),
  ]);

  if (assets.length === 0) {
    throw new Error(
      `No Cloud KMS keys or Secret Manager secrets found in project "${creds.projectId}". ` +
      "Ensure the service account has cloudkms.cryptoKeys.list, cloudkms.keyRings.list, and secretmanager.secrets.list permissions.",
    );
  }

  return assets;
}

async function scanCloudKms(
  creds: GcpCredentials,
  clientOptions: GcpClientOptions,
  assets: AssetTemplate[],
): Promise<void> {
  const kmsClient = new KeyManagementServiceClient(clientOptions);
  const locations = creds.locations ?? ["global", "us-central1", "us-east1", "europe-west1", "asia-east1"];

  for (const location of locations) {
    try {
      const [keyRings] = await kmsClient.listKeyRings({
        parent: `projects/${creds.projectId}/locations/${location}`,
      });

      for (const ring of keyRings) {
        if (!ring.name) continue;

        try {
          const [cryptoKeys] = await kmsClient.listCryptoKeys({ parent: ring.name });

          for (const ck of cryptoKeys) {
            if (!ck.name) continue;

            try {
              const keyName = ck.name.split("/").pop() ?? ck.name;
              const ringName = ring.name.split("/").pop() ?? ring.name;
              const purpose = ck.purpose?.toString() ?? "ENCRYPT_DECRYPT";
              const isSymmetric = purpose === "ENCRYPT_DECRYPT";

              let algorithm = "AES-256-GCM";
              let keyLength = 256;
              let assetType = "kms_key";
              let isQuantumSafe = isSymmetric;
              let riskLevel = "low";
              let riskReason: string | null = null;
              let remediationAdvice: string | null = null;

              if (!isSymmetric) {
                try {
                  const [versions] = await kmsClient.listCryptoKeyVersions({
                    parent: ck.name,
                    filter: "state=ENABLED",
                  });
                  const ver = versions[0];
                  const algProto = ver?.algorithm?.toString() ?? "";

                  if (algProto.includes("RSA")) {
                    const sizeMatch = algProto.match(/(\d+)/);
                    keyLength = sizeMatch ? parseInt(sizeMatch[1]) : 2048;
                    algorithm = "RSA";
                    isQuantumSafe = false;
                    riskLevel = "medium";
                    riskReason = `RSA-${keyLength} asymmetric key is quantum-vulnerable.`;
                    remediationAdvice = "Evaluate migration to Cloud KMS post-quantum signing keys when generally available.";
                  } else if (algProto.includes("EC")) {
                    algorithm = "ECDSA";
                    keyLength = algProto.includes("384") ? 384 : 256;
                    isQuantumSafe = false;
                    riskLevel = "medium";
                    riskReason = "ECDSA key is quantum-vulnerable.";
                    remediationAdvice = "Monitor GCP Cloud KMS for post-quantum algorithm availability.";
                  } else {
                    algorithm = algProto || "Unknown";
                    isQuantumSafe = false;
                  }
                } catch {
                }

                assetType = purpose.includes("SIGN") ? "code_signing_key" : "asymmetric_key";
              }

              const rotationPeriod = ck.rotationPeriod;
              if (isSymmetric && rotationPeriod) {
                const seconds = typeof rotationPeriod === "object" && "seconds" in rotationPeriod
                  ? Number((rotationPeriod as { seconds?: number }).seconds)
                  : 0;
                if (seconds > 0 && seconds < 7776000) {
                  riskLevel = "info";
                } else if (seconds === 0) {
                  riskLevel = "medium";
                  riskReason = "No automatic rotation period configured for symmetric key.";
                  remediationAdvice = "Configure automatic rotation in Cloud KMS (recommended: 90 days).";
                }
              }

              assets.push({
                name: `${ringName}/${keyName}`,
                assetType,
                algorithm,
                keyLength,
                issuer: "Cloud KMS",
                subject: null,
                expiresAt: null,
                riskLevel,
                riskReason,
                remediationAdvice,
                isQuantumSafe,
                location: `${location}/cloudkms/projects/${creds.projectId}/keyRings/${ringName}/cryptoKeys/${keyName}`,
                tags: ["cloud-kms", isSymmetric ? "symmetric" : "asymmetric", location, "gcp"],
              });
            } catch {
            }
          }
        } catch {
        }
      }
    } catch {
    }
  }
}

async function scanSecretManager(
  creds: GcpCredentials,
  clientOptions: GcpClientOptions,
  assets: AssetTemplate[],
): Promise<void> {
  const secretClient = new SecretManagerServiceClient(clientOptions);

  try {
    const [secrets] = await secretClient.listSecrets({
      parent: `projects/${creds.projectId}`,
    });

    for (const secret of secrets) {
      if (!secret.name) continue;

      try {
        const secretName = secret.name.split("/").pop() ?? secret.name;
        const replication = secret.replication;

        const lastRotated = (secret as unknown as Record<string, unknown>).createTime as { seconds?: number } | undefined;
        const createdSeconds = lastRotated?.seconds ?? 0;
        const daysSinceCreation = createdSeconds > 0
          ? Math.floor((Date.now() / 1000 - createdSeconds) / 86400)
          : 0;

        const hasAutoReplication = replication?.automatic !== null && replication?.automatic !== undefined;

        let riskLevel = "low";
        let riskReason: string | null = null;
        let remediationAdvice: string | null = null;

        const rotation = (secret as unknown as Record<string, unknown>).rotation as { nextRotationTime?: unknown } | null | undefined;
        const hasRotation = rotation?.nextRotationTime != null;

        if (!hasRotation && daysSinceCreation > 365) {
          riskLevel = "high";
          riskReason = `Secret has no automatic rotation policy and is over ${daysSinceCreation} days old. Risk of stale credential exposure.`;
          remediationAdvice = "Configure automatic rotation in Secret Manager. Prefer short rotation intervals (30-90 days).";
        } else if (!hasRotation && daysSinceCreation > 90) {
          riskLevel = "medium";
          riskReason = "Secret does not have automatic rotation configured.";
          remediationAdvice = "Configure automatic rotation in Secret Manager to reduce exposure from leaked credentials.";
        }

        assets.push({
          name: secretName,
          assetType: "secret",
          algorithm: "AES-256",
          keyLength: 256,
          issuer: "Google Secret Manager",
          subject: null,
          expiresAt: null,
          riskLevel,
          riskReason,
          remediationAdvice,
          isQuantumSafe: true,
          location: `global/secretmanager/projects/${creds.projectId}/secrets/${secretName}`,
          tags: [
            "secret-manager",
            "secret",
            "gcp",
            hasAutoReplication ? "auto-replication" : "user-managed-replication",
            ...(hasRotation ? ["auto-rotation"] : ["no-rotation"]),
          ],
        });
      } catch {
      }
    }
  } catch {
  }
}
