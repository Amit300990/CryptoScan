import * as crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_ENV = "CREDENTIAL_ENCRYPTION_KEY";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = "enc:v1:";

function getEncryptionKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(
      `${KEY_ENV} environment variable is not set. ` +
      "Credential storage requires encryption to be configured. " +
      "Generate a key with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
      `and set it as the ${KEY_ENV} environment variable.`,
    );
  }
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) {
    throw new Error(
      `${KEY_ENV} must be a 64-character hex string (32 bytes). Got ${buf.length} bytes. ` +
      "Generate a valid key with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return buf;
}

export function encryptCredentials(plainJson: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM;
  const encrypted = Buffer.concat([cipher.update(plainJson, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, encrypted]);
  return ENCRYPTED_PREFIX + combined.toString("base64");
}

export function decryptCredentials(stored: string): string {
  if (!stored.startsWith(ENCRYPTED_PREFIX)) {
    return stored;
  }

  const key = getEncryptionKey();
  const combined = Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), "base64");
  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv) as crypto.DecipherGCM;
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

export function isEncryptionEnabled(): boolean {
  return !!process.env[KEY_ENV];
}
