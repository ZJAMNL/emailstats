import { createHash, randomBytes } from "node:crypto";

/** One-time recovery codes for when the phone with the authenticator app is lost. */
const COUNT = 8;
// No 0/O, 1/I/L: easy to read back from paper.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function hashCode(code: string) {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

export function normalizeRecoveryCode(code: string) {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** New codes ("ABCD-EFGH", 40 bits each) and the hashes to store. */
export function generateRecoveryCodes() {
  const codes = Array.from({ length: COUNT }, () => {
    const bytes = randomBytes(8);
    const chars = [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
  return { codes, hashes: codes.map(hashCode) };
}

/** The stored hashes without the code that was used, or null when it does not match any of them. */
export function consumeRecoveryCode(hashes: string[], code: string) {
  if (normalizeRecoveryCode(code).length !== 8) return null;
  const hash = hashCode(code);
  return hashes.includes(hash) ? hashes.filter((stored) => stored !== hash) : null;
}
