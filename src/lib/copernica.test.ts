import { afterEach, describe, expect, it } from "vitest";
import { decryptCopernicaToken, encryptCopernicaToken } from "./copernica-crypto";

const originalEncryptionKey = process.env.COPERNICA_TOKEN_ENCRYPTION_KEY;

afterEach(() => {
  if (originalEncryptionKey === undefined) delete process.env.COPERNICA_TOKEN_ENCRYPTION_KEY;
  else process.env.COPERNICA_TOKEN_ENCRYPTION_KEY = originalEncryptionKey;
});

describe("Copernica token encryption", () => {
  it("encrypts tokens and decrypts them with the configured key", () => {
    process.env.COPERNICA_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    const apiToken = "copernica-test-token";

    const encrypted = encryptCopernicaToken(apiToken);

    expect(encrypted).not.toContain(apiToken);
    expect(decryptCopernicaToken(encrypted)).toBe(apiToken);
  });

  it("rejects decryption with a different key", () => {
    process.env.COPERNICA_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    const encrypted = encryptCopernicaToken("copernica-test-token");
    process.env.COPERNICA_TOKEN_ENCRYPTION_KEY = "b".repeat(64);

    expect(() => decryptCopernicaToken(encrypted)).toThrow();
  });

  it("requires a 32-byte hex encryption key", () => {
    process.env.COPERNICA_TOKEN_ENCRYPTION_KEY = "too-short";

    expect(() => encryptCopernicaToken("copernica-test-token")).toThrow(/32-byte hex/);
  });
});
