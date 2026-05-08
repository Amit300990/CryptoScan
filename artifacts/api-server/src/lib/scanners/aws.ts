import { ACMClient, ListCertificatesCommand, DescribeCertificateCommand } from "@aws-sdk/client-acm";
import { KMSClient, ListKeysCommand, DescribeKeyCommand } from "@aws-sdk/client-kms";
import { IAMClient, ListAccessKeysCommand, ListUsersCommand, ListSigningCertificatesCommand } from "@aws-sdk/client-iam";
import { SecretsManagerClient, ListSecretsCommand } from "@aws-sdk/client-secrets-manager";
import { type AwsCredentials, type AssetTemplate, assessCertificateRisk } from "./types";

function makeConfig(creds: AwsCredentials) {
  const region = creds.region || "us-east-1";
  if (creds.accessKeyId && creds.secretAccessKey) {
    return {
      region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        ...(creds.sessionToken ? { sessionToken: creds.sessionToken } : {}),
      },
    };
  }
  return { region };
}

export async function scanAws(creds: AwsCredentials): Promise<AssetTemplate[]> {
  const config = makeConfig(creds);
  const assets: AssetTemplate[] = [];

  await Promise.all([
    scanAcm(config, assets),
    scanKms(config, assets),
    scanIam(config, assets),
    scanSecretsManager(config, assets),
  ]);

  return assets;
}

async function scanAcm(config: ReturnType<typeof makeConfig>, assets: AssetTemplate[]): Promise<void> {
  const client = new ACMClient(config);

  const certs = [];
  let nextToken: string | undefined;
  do {
    const listRes = await client.send(new ListCertificatesCommand({ MaxItems: 1000, NextToken: nextToken }));
    certs.push(...(listRes.CertificateSummaryList ?? []));
    nextToken = listRes.NextToken;
  } while (nextToken);

  for (const cert of certs) {
    if (!cert.CertificateArn) continue;

    try {
      const detail = await client.send(new DescribeCertificateCommand({ CertificateArn: cert.CertificateArn }));
      const c = detail.Certificate;
      if (!c) continue;

      const name = cert.DomainName ?? c.DomainName ?? cert.CertificateArn.split("/").pop() ?? "acm-cert";
      const expiresAt = c.NotAfter ?? null;
      const algorithm = c.KeyAlgorithm?.toString() ?? "RSA";
      const keyLength = algorithm.includes("RSA") ? (algorithm.includes("2048") ? 2048 : algorithm.includes("4096") ? 4096 : 2048) : null;
      const parts = algorithm.match(/(\d+)/);
      const parsedKeyLength = parts ? parseInt(parts[1]) : keyLength;
      const issuer = c.Issuer ?? "Amazon";
      const subject = c.Subject ?? `CN=${c.DomainName}`;
      const arnParts = cert.CertificateArn.split(":");
      const region = arnParts[3] ?? config.region;

      const risk = assessCertificateRisk(algorithm.includes("RSA") ? "RSA" : algorithm, parsedKeyLength, expiresAt);

      assets.push({
        name,
        assetType: "certificate",
        algorithm: algorithm.includes("RSA") ? "RSA" : algorithm,
        keyLength: parsedKeyLength,
        issuer,
        subject,
        expiresAt,
        ...risk,
        location: `${region}/ACM/${cert.CertificateArn.split("/").pop()}`,
        tags: ["acm", "certificate", ...(c.InUseBy && c.InUseBy.length > 0 ? ["in-use"] : ["not-in-use"])],
      });
    } catch {
    }
  }
}

async function scanKms(config: ReturnType<typeof makeConfig>, assets: AssetTemplate[]): Promise<void> {
  const client = new KMSClient(config);

  const listRes = await client.send(new ListKeysCommand({ Limit: 1000 }));
  const keys = listRes.Keys ?? [];

  for (const key of keys) {
    if (!key.KeyId) continue;

    try {
      const detail = await client.send(new DescribeKeyCommand({ KeyId: key.KeyId }));
      const m = detail.KeyMetadata;
      if (!m) continue;
      if (m.KeyState === "PendingDeletion" || m.KeyState === "Disabled") continue;

      const algorithm = m.KeySpec?.toString() ?? "SYMMETRIC_DEFAULT";
      const isSymmetric = algorithm === "SYMMETRIC_DEFAULT" || algorithm.includes("AES");
      const displayAlg = isSymmetric ? "AES-256" : algorithm.replace("_", "-");
      const keyLength = isSymmetric ? 256 : (algorithm.includes("2048") ? 2048 : algorithm.includes("4096") ? 4096 : null);

      let riskLevel = "low";
      let riskReason: string | null = null;
      let remediationAdvice: string | null = null;
      const isQuantumSafe = isSymmetric;

      if (!isSymmetric) {
        riskLevel = "medium";
        riskReason = `${displayAlg} asymmetric key is quantum-vulnerable.`;
        remediationAdvice = "Evaluate migration to post-quantum algorithms when available in Cloud KMS.";
      }

      const keyAlias = m.Description || key.KeyId;
      assets.push({
        name: keyAlias.substring(0, 64),
        assetType: "kms_key",
        algorithm: displayAlg,
        keyLength,
        issuer: "AWS KMS",
        subject: null,
        expiresAt: null,
        riskLevel,
        riskReason,
        remediationAdvice,
        isQuantumSafe,
        location: `${config.region}/KMS/${key.KeyId}`,
        tags: ["kms", isSymmetric ? "symmetric" : "asymmetric", m.KeyManager === "AWS" ? "aws-managed" : "customer-managed"],
      });
    } catch {
    }
  }
}

async function scanIam(config: ReturnType<typeof makeConfig>, assets: AssetTemplate[]): Promise<void> {
  const client = new IAMClient(config);

  const users = [];
  let userMarker: string | undefined;
  do {
    const usersRes = await client.send(new ListUsersCommand({ MaxItems: 1000, Marker: userMarker }));
    users.push(...(usersRes.Users ?? []));
    userMarker = usersRes.IsTruncated ? usersRes.Marker : undefined;
  } while (userMarker);

  for (const user of users) {
    try {
      const keysRes = await client.send(new ListAccessKeysCommand({ UserName: user.UserName }));
      const keys = keysRes.AccessKeyMetadata ?? [];

      for (const key of keys) {
        if (!key.AccessKeyId || key.Status !== "Active") continue;

        const createdAt = key.CreateDate;
        let daysSinceCreation = 0;
        if (createdAt) {
          daysSinceCreation = Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);
        }

        let riskLevel = "low";
        let riskReason: string | null = null;
        let remediationAdvice: string | null = null;

        if (daysSinceCreation > 365) {
          riskLevel = "critical";
          riskReason = `IAM access key is ${daysSinceCreation} days old and has not been rotated. Active risk of compromise.`;
          remediationAdvice = "Rotate IAM access key immediately. Prefer IAM roles or Workload Identity over long-lived access keys.";
        } else if (daysSinceCreation > 180) {
          riskLevel = "high";
          riskReason = `IAM access key has not been rotated in ${daysSinceCreation} days (policy requires 90-day rotation).`;
          remediationAdvice = "Rotate IAM access key. Create new key, update services, then deactivate old key.";
        } else if (daysSinceCreation > 90) {
          riskLevel = "medium";
          riskReason = `IAM access key is ${daysSinceCreation} days old.`;
          remediationAdvice = "Plan key rotation soon per 90-day rotation policy.";
        }

        assets.push({
          name: `iam-access-key-${user.UserName}`,
          assetType: "secret",
          algorithm: "HMAC-SHA256",
          keyLength: 256,
          issuer: "IAM",
          subject: user.Arn ?? user.UserName,
          expiresAt: null,
          riskLevel,
          riskReason,
          remediationAdvice,
          isQuantumSafe: false,
          location: `${config.region}/IAM/users/${user.UserName}/access-keys/${key.AccessKeyId}`,
          tags: ["iam", "access-key", user.UserName ?? "unknown-user"],
        });
      }

      const signingCertsRes = await client.send(new ListSigningCertificatesCommand({ UserName: user.UserName }));
      for (const cert of signingCertsRes.Certificates ?? []) {
        if (cert.Status !== "Active") continue;

        assets.push({
          name: `iam-signing-cert-${user.UserName}`,
          assetType: "certificate",
          algorithm: "RSA",
          keyLength: 2048,
          issuer: "IAM",
          subject: user.Arn ?? user.UserName,
          expiresAt: null,
          riskLevel: "medium",
          riskReason: "IAM signing certificates are RSA-based and quantum-vulnerable.",
          remediationAdvice: "Consider migrating to IAM roles with temporary credentials instead of signing certificates.",
          isQuantumSafe: false,
          location: `${config.region}/IAM/users/${user.UserName}/signing-certs`,
          tags: ["iam", "signing-cert"],
        });
      }
    } catch {
    }
  }
}

async function scanSecretsManager(config: ReturnType<typeof makeConfig>, assets: AssetTemplate[]): Promise<void> {
  const client = new SecretsManagerClient(config);

  const secrets = [];
  let secretNextToken: string | undefined;
  do {
    const listRes = await client.send(new ListSecretsCommand({ MaxResults: 100, NextToken: secretNextToken }));
    secrets.push(...(listRes.SecretList ?? []));
    secretNextToken = listRes.NextToken;
  } while (secretNextToken);

  for (const secret of secrets) {
    if (!secret.Name) continue;

    const lastRotated = secret.LastRotatedDate;
    const lastChanged = secret.LastChangedDate ?? secret.CreatedDate;
    const daysSinceChange = lastChanged ? Math.floor((Date.now() - lastChanged.getTime()) / 86_400_000) : 0;

    let riskLevel = "low";
    let riskReason: string | null = null;
    let remediationAdvice: string | null = null;

    if (!lastRotated && daysSinceChange > 365) {
      riskLevel = "high";
      riskReason = `Secret has never been rotated and is ${daysSinceChange} days old.`;
      remediationAdvice = "Enable automatic rotation in AWS Secrets Manager.";
    } else if (!lastRotated && daysSinceChange > 90) {
      riskLevel = "medium";
      riskReason = "Secret does not have automatic rotation enabled.";
      remediationAdvice = "Enable automatic rotation in AWS Secrets Manager.";
    }

    assets.push({
      name: secret.Name.substring(0, 64),
      assetType: "secret",
      algorithm: "AES-256",
      keyLength: 256,
      issuer: "AWS Secrets Manager",
      subject: null,
      expiresAt: null,
      riskLevel,
      riskReason,
      remediationAdvice,
      isQuantumSafe: true,
      location: `${config.region}/SecretsManager/${secret.Name}`,
      tags: ["secrets-manager", "secret", ...(secret.RotationEnabled ? ["auto-rotation"] : ["no-rotation"])],
    });
  }
}
