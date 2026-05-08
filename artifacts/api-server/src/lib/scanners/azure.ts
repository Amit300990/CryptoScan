import { ClientSecretCredential } from "@azure/identity";
import { CertificateClient } from "@azure/keyvault-certificates";
import { KeyClient } from "@azure/keyvault-keys";
import { type AzureCredentials, type AssetTemplate, assessCertificateRisk } from "./types";

export async function scanAzure(creds: AzureCredentials): Promise<AssetTemplate[]> {
  const credential = new ClientSecretCredential(
    creds.tenantId,
    creds.clientId,
    creds.clientSecret,
  );

  const vaultUrls = creds.vaultUrls ?? [];
  if (vaultUrls.length === 0) {
    throw new Error(
      "No vault URLs configured. Add at least one Azure Key Vault URL in the connection credentials (e.g. https://my-vault.vault.azure.net).",
    );
  }

  const assets: AssetTemplate[] = [];

  await Promise.all(
    vaultUrls.map((vaultUrl) => scanVault(credential, vaultUrl, assets)),
  );

  return assets;
}

async function scanVault(
  credential: ClientSecretCredential,
  vaultUrl: string,
  assets: AssetTemplate[],
): Promise<void> {
  const vaultName = new URL(vaultUrl).hostname.split(".")[0];
  const region = "global";

  await Promise.all([
    scanVaultCertificates(credential, vaultUrl, vaultName, region, assets),
    scanVaultKeys(credential, vaultUrl, vaultName, region, assets),
  ]);
}

async function scanVaultCertificates(
  credential: ClientSecretCredential,
  vaultUrl: string,
  vaultName: string,
  region: string,
  assets: AssetTemplate[],
): Promise<void> {
  const client = new CertificateClient(vaultUrl, credential);

  for await (const certProp of client.listPropertiesOfCertificates()) {
    try {
      const cert = await client.getCertificate(certProp.name ?? "");
      const policy = cert.policy;

      const algorithm = policy?.keyType === "EC" ? "ECDSA" : "RSA";
      const keyLength = policy?.keyCurveName
        ? (policy.keyCurveName === "P-384" ? 384 : policy.keyCurveName === "P-521" ? 521 : 256)
        : (policy?.keySize ?? 2048);

      const expiresAt = cert.properties?.expiresOn ?? null;
      const issuer = (policy?.issuerName as string | undefined) ?? "Unknown";
      const subject = cert.name;

      const risk = assessCertificateRisk(algorithm, keyLength, expiresAt);

      assets.push({
        name: cert.name,
        assetType: "certificate",
        algorithm,
        keyLength,
        issuer,
        subject,
        expiresAt,
        ...risk,
        location: `${region}/KeyVault/${vaultName}/certificates/${cert.name}`,
        tags: ["key-vault", "certificate", vaultName, ...(cert.properties?.enabled === false ? ["disabled"] : [])],
      });
    } catch {
    }
  }
}

async function scanVaultKeys(
  credential: ClientSecretCredential,
  vaultUrl: string,
  vaultName: string,
  region: string,
  assets: AssetTemplate[],
): Promise<void> {
  const client = new KeyClient(vaultUrl, credential);

  for await (const keyProp of client.listPropertiesOfKeys()) {
    try {
      const key = await client.getKey(keyProp.name);
      const kType = key.keyType?.toString() ?? "RSA";
      const isSymmetric = kType === "oct" || kType === "oct-HSM";
      const isEc = kType === "EC" || kType === "EC-HSM";

      let algorithm: string;
      let keyLength: number | null = null;
      let isQuantumSafe = false;
      let riskLevel = "low";
      let riskReason: string | null = null;
      let remediationAdvice: string | null = null;

      if (isSymmetric) {
        algorithm = "AES-256";
        keyLength = 256;
        isQuantumSafe = true;
      } else if (isEc) {
        const curve = key.key?.crv?.toString() ?? "P-256";
        algorithm = "ECDSA";
        keyLength = curve === "P-384" ? 384 : curve === "P-521" ? 521 : 256;
        isQuantumSafe = false;
        riskLevel = "medium";
        riskReason = "ECDSA keys are quantum-vulnerable.";
        remediationAdvice = "Plan migration to post-quantum key types when available in Azure Key Vault.";
      } else {
        const rsaKeySize = key.key?.n ? Math.floor(key.key.n.length * 8) : 2048;
        algorithm = "RSA";
        keyLength = rsaKeySize >= 3000 ? 4096 : 2048;
        isQuantumSafe = false;
        if (keyLength < 3072) {
          riskLevel = "high";
          riskReason = `RSA-${keyLength} is below the recommended 3072-bit minimum.`;
          remediationAdvice = "Re-create key with RSA-4096 or switch to EC P-384.";
        } else {
          riskLevel = "medium";
          riskReason = "RSA key is quantum-vulnerable.";
          remediationAdvice = "Plan migration to post-quantum algorithm.";
        }
      }

      const expiresAt = keyProp.expiresOn ?? null;
      if (expiresAt) {
        const days = Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000);
        if (days < 30) {
          riskLevel = "critical";
          riskReason = (riskReason ? riskReason + " " : "") + `Key expires in ${days} day(s).`;
          remediationAdvice = (remediationAdvice ? remediationAdvice + " " : "") + "Rotate key immediately.";
        } else if (days < 60 && riskLevel !== "critical") {
          riskLevel = "high";
          riskReason = (riskReason ? riskReason + " " : "") + `Key expires in ${days} days.`;
          remediationAdvice = (remediationAdvice ? remediationAdvice + " " : "") + "Plan key rotation soon.";
        }
      }

      assets.push({
        name: key.name,
        assetType: isSymmetric ? "symmetric_key" : "asymmetric_key",
        algorithm,
        keyLength,
        issuer: null,
        subject: null,
        expiresAt,
        riskLevel,
        riskReason,
        remediationAdvice,
        isQuantumSafe,
        location: `${region}/KeyVault/${vaultName}/keys/${key.name}`,
        tags: ["key-vault", "key", kType.toLowerCase(), vaultName],
      });
    } catch {
    }
  }
}
