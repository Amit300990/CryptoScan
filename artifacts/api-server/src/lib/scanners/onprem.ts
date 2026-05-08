import * as tls from "tls";
import * as crypto from "crypto";
import { spawn } from "child_process";
import { type OnPremCredentials, type AssetTemplate, assessCertificateRisk } from "./types";

type CertInfo = {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  algorithm: string;
  bits: number | null;
  fingerprint: string;
  serialNumber: string;
};

type TlsCheckResult = {
  host: string;
  port: number;
  certificate: CertInfo | null;
  tlsVersion: string | null;
  error: string | null;
};

function runOpenssl(host: string, port: number, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "s_client",
      "-connect", `${host}:${port}`,
      "-showcerts",
      "-no_ign_eof",
    ];

    const child = spawn("openssl", args, { env: { ...process.env } });
    let output = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });

    child.stdin.end();

    child.on("close", () => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`openssl timed out after ${timeoutMs}ms`));
      } else {
        resolve(output);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function checkViaOpenssl(host: string, port: number, timeoutMs = 10000): Promise<TlsCheckResult> {
  const result: TlsCheckResult = { host, port, certificate: null, tlsVersion: null, error: null };

  try {
    const output = await runOpenssl(host, port, timeoutMs);

    const versionMatch = output.match(/Protocol\s*:\s*(TLSv[\d.]+)/i) ?? output.match(/(TLSv[\d.]+)/);
    if (versionMatch) {
      result.tlsVersion = versionMatch[1];
    }

    const subjMatch = output.match(/subject\s*=?\s*([^\n]+)/i);
    const issuerMatch = output.match(/issuer\s*=?\s*([^\n]+)/i);
    const notBeforeMatch = output.match(/Not Before\s*:\s*([^\n]+)/i);
    const notAfterMatch = output.match(/Not After\s*:\s*([^\n]+)/i);
    const fingerprintMatch = output.match(/SHA256 Fingerprint=([^\n]+)/i) ??
      output.match(/SHA1 Fingerprint=([^\n]+)/i);
    const serialMatch = output.match(/Serial Number\s*:?\s*([^\n]+)/i);

    if (subjMatch && issuerMatch) {
      const subject = subjMatch[1].trim();
      const issuer = issuerMatch[1].trim();

      let algorithm = "Unknown";
      let bits: number | null = null;

      const rsaMatch = output.match(/Server Temp Key:\s*RSA,\s*(\d+)/i) ??
        output.match(/Public Key Algorithm:\s*rsaEncryption/i);
      const ecMatch = output.match(/Server Temp Key:\s*(?:ECDH|X\d+),\s*(\d+)/i) ??
        output.match(/Public Key Algorithm:\s*id-ecPublicKey/i);
      const bitsMatch = output.match(/Public-Key:\s*\((\d+)\s*bit\)/i);

      if (bitsMatch) bits = parseInt(bitsMatch[1]);

      if (ecMatch) {
        algorithm = "ECDSA";
        const ecBitsMatch = output.match(/Server Temp Key: (?:ECDH|X\d+), (\d+)/i);
        if (ecBitsMatch) bits = parseInt(ecBitsMatch[1]);
        else if (!bits) bits = 256;
      } else if (rsaMatch || output.includes("rsaEncryption")) {
        algorithm = "RSA";
        if (!bits) bits = 2048;
      } else if (output.includes("Ed25519") || output.includes("ED25519")) {
        algorithm = "Ed25519";
        bits = 256;
      }

      result.certificate = {
        subject,
        issuer,
        validFrom: notBeforeMatch?.[1].trim() ?? "",
        validTo: notAfterMatch?.[1].trim() ?? "",
        algorithm,
        bits,
        fingerprint: fingerprintMatch?.[1].trim() ?? "",
        serialNumber: serialMatch?.[1].trim() ?? "",
      };
    }

    if (!result.certificate && !result.tlsVersion) {
      result.error = "openssl returned no certificate data";
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("not found")) {
      return checkViaTlsModule(host, port, timeoutMs);
    }
    result.error = msg;
  }

  return result;
}

function checkViaTlsModule(host: string, port: number, timeoutMs = 10000): Promise<TlsCheckResult> {
  return new Promise((resolve) => {
    const result: TlsCheckResult = { host, port, certificate: null, tlsVersion: null, error: null };

    const socket = tls.connect(
      { host, port, rejectUnauthorized: false, timeout: timeoutMs },
      () => {
        try {
          const cert = socket.getPeerCertificate(true);
          const protocol = socket.getProtocol();
          result.tlsVersion = protocol;

          if (cert && cert.subject) {
            const subject = cert.subject
              ? Object.entries(cert.subject)
                  .map(([k, v]) => `${k}=${Array.isArray(v) ? v[0] : v}`)
                  .join(", ")
              : host;
            const issuer = cert.issuer
              ? Object.entries(cert.issuer)
                  .map(([k, v]) => `${k}=${Array.isArray(v) ? v[0] : v}`)
                  .join(", ")
              : "Unknown";

            let bits: number | null = (cert as unknown as Record<string, unknown>)["bits"] as number | null ?? null;
            let algorithm = "Unknown";

            const certAny = cert as unknown as Record<string, unknown>;
            const asn1Curve = certAny["asn1Curve"] as string | undefined;
            const nistCurve = certAny["nistCurve"] as string | undefined;
            const modulus = certAny["modulus"] as string | undefined;

            if (asn1Curve || nistCurve) {
              algorithm = "ECDSA";
              const curve = nistCurve ?? asn1Curve ?? "";
              bits = curve.includes("384") ? 384 : curve.includes("521") ? 521 : (bits ?? 256);
            } else if (modulus) {
              algorithm = "RSA";
              bits = bits ?? Math.floor(modulus.length * 4);
            } else {
              try {
                const pubKey = cert.pubkey;
                if (pubKey) {
                  const keyObj = crypto.createPublicKey(pubKey);
                  if (keyObj.asymmetricKeyType === "rsa") {
                    algorithm = "RSA";
                    bits = keyObj.asymmetricKeyDetails?.modulusLength ?? bits;
                  } else if (keyObj.asymmetricKeyType === "ec") {
                    algorithm = "ECDSA";
                  } else if (keyObj.asymmetricKeyType === "ed25519") {
                    algorithm = "Ed25519";
                    bits = 256;
                  }
                }
              } catch {
              }
            }

            result.certificate = {
              subject,
              issuer,
              validFrom: cert.valid_from,
              validTo: cert.valid_to,
              algorithm,
              bits,
              fingerprint: cert.fingerprint ?? "",
              serialNumber: cert.serialNumber ?? "",
            };
          }
        } catch (err) {
          result.error = err instanceof Error ? err.message : String(err);
        }
        socket.destroy();
        resolve(result);
      },
    );

    socket.on("error", (err) => {
      result.error = err.message;
      resolve(result);
    });

    socket.setTimeout(timeoutMs, () => {
      result.error = `Connection timed out after ${timeoutMs}ms`;
      socket.destroy();
      resolve(result);
    });
  });
}

export async function scanOnPrem(creds: OnPremCredentials): Promise<AssetTemplate[]> {
  if (!creds.hosts || creds.hosts.length === 0) {
    throw new Error(
      "No hosts configured for on-premises scan. Add hosts in the connection credentials: [{host, port, name}].",
    );
  }

  const results = await Promise.all(
    creds.hosts.map((h) => checkViaOpenssl(h.host, h.port ?? 443)),
  );

  const assets: AssetTemplate[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const hostCfg = creds.hosts[i];
    const displayName = hostCfg.name ?? result.host;

    if (result.error && !result.certificate) {
      assets.push({
        name: `${displayName}:${result.port}`,
        assetType: "certificate",
        algorithm: null,
        keyLength: null,
        issuer: null,
        subject: null,
        expiresAt: null,
        riskLevel: "high",
        riskReason: `Could not connect to ${result.host}:${result.port} — ${result.error}`,
        remediationAdvice: "Verify the host is reachable and TLS is configured on the specified port.",
        isQuantumSafe: false,
        location: `${result.host}:${result.port}`,
        tags: ["on-prem", "tls", "unreachable"],
      });
      continue;
    }

    if (result.certificate) {
      const cert = result.certificate;
      const expiresAt = cert.validTo ? new Date(cert.validTo) : null;
      const risk = assessCertificateRisk(cert.algorithm, cert.bits, expiresAt);

      assets.push({
        name: `${displayName} TLS Certificate`,
        assetType: "certificate",
        algorithm: cert.algorithm,
        keyLength: cert.bits,
        issuer: cert.issuer,
        subject: cert.subject,
        expiresAt,
        ...risk,
        location: `${result.host}:${result.port}`,
        tags: ["on-prem", "tls", "certificate", result.host],
      });
    }

    if (result.tlsVersion) {
      const tlsRiskMap: Record<string, { riskLevel: string; riskReason: string | null; remediationAdvice: string | null }> = {
        "TLSv1": {
          riskLevel: "critical",
          riskReason: "TLS 1.0 is deprecated and vulnerable to BEAST and POODLE attacks.",
          remediationAdvice: "Upgrade to TLS 1.2 minimum, prefer TLS 1.3.",
        },
        "TLSv1.1": {
          riskLevel: "high",
          riskReason: "TLS 1.1 is deprecated and vulnerable to POODLE and downgrade attacks.",
          remediationAdvice: "Upgrade to TLS 1.2 minimum, prefer TLS 1.3.",
        },
        "TLSv1.2": {
          riskLevel: "low",
          riskReason: null,
          remediationAdvice: null,
        },
        "TLSv1.3": {
          riskLevel: "info",
          riskReason: null,
          remediationAdvice: null,
        },
      };

      const tlsRisk = tlsRiskMap[result.tlsVersion] ?? {
        riskLevel: "medium",
        riskReason: `Unknown TLS version: ${result.tlsVersion}`,
        remediationAdvice: "Verify TLS configuration.",
      };

      assets.push({
        name: `${displayName} TLS Configuration`,
        assetType: "tls_config",
        algorithm: result.tlsVersion,
        keyLength: null,
        issuer: null,
        subject: null,
        expiresAt: null,
        ...tlsRisk,
        isQuantumSafe: false,
        location: `${result.host}:${result.port}`,
        tags: ["on-prem", "tls", "protocol", result.host],
      });
    }
  }

  return assets;
}
