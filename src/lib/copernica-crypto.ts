import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function encryptCopernicaToken(token: string) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((value) => value.toString("hex")).join(".");
}

export function decryptCopernicaToken(encrypted: string) {
  const [ivHex, tagHex, ciphertextHex] = encrypted.split(".");
  if (!ivHex || !tagHex || !ciphertextHex) throw new Error("Stored Copernica credential is invalid.");

  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]).toString("utf8");
}

function getEncryptionKey() {
  const configuredKey = process.env.COPERNICA_TOKEN_ENCRYPTION_KEY;
  if (!configuredKey || !/^[a-f0-9]{64}$/i.test(configuredKey)) {
    throw new Error("COPERNICA_TOKEN_ENCRYPTION_KEY must be a 32-byte hex value.");
  }
  return Buffer.from(configuredKey, "hex");
}
