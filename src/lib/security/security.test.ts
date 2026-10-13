import { describe, expect, it } from "vitest";
import { evaluateAccess, evaluateActivity, evaluateCertificate, evaluateConfig, evaluateDependencies, evaluateHeaders, evaluateMfa, worstStatus } from "./checks";
import { consumeRecoveryCode, generateRecoveryCodes } from "./recovery";
import { base32Decode, base32Encode, currentStep, generateTotpSecret, otpauthUrl, totpCode, verifyTotp } from "./totp";

// RFC 6238 test secret "12345678901234567890" (SHA-1).
const rfcSecret = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors", () => {
    expect(totpCode(rfcSecret, Math.floor(59 / 30), 8)).toBe("94287082");
    expect(totpCode(rfcSecret, Math.floor(1111111109 / 30), 8)).toBe("07081804");
    expect(totpCode(rfcSecret, Math.floor(2000000000 / 30), 8)).toBe("69279037");
  });

  it("round-trips base32 and makes 160-bit secrets", () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(base32Decode(generateTotpSecret())).toHaveLength(20);
  });

  it("accepts the current code and a neighbouring step, but never the same step twice", () => {
    const secret = generateTotpSecret();
    const now = Date.UTC(2026, 9, 13, 9, 0, 10);
    const step = currentStep(now);
    expect(verifyTotp(secret, totpCode(secret, step), null, now)).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step - 3), null, now)).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, step), step, now)).toBeNull();
    expect(verifyTotp(secret, "12345", null, now)).toBeNull();
    expect(verifyTotp(secret, `${totpCode(secret, step).slice(0, 3)} ${totpCode(secret, step).slice(3)}`, null, now)).toBe(step);
  });

  it("builds an otpauth link an authenticator app understands", () => {
    expect(otpauthUrl("ABC", "anna@example.nl")).toBe("otpauth://totp/E-mail%20Statistieken%3Aanna%40example.nl?secret=ABC&issuer=E-mail%20Statistieken&algorithm=SHA1&digits=6&period=30");
  });
});

describe("recovery codes", () => {
  it("works once per code, ignoring case and dashes", () => {
    const { codes, hashes } = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    const remaining = consumeRecoveryCode(hashes, codes[2].toLowerCase().replace("-", ""));
    expect(remaining).toHaveLength(7);
    expect(consumeRecoveryCode(remaining!, codes[2])).toBeNull();
    expect(consumeRecoveryCode(hashes, "AAAA-AAAA")).toBeNull();
  });
});

describe("security checks", () => {
  it("flags weak configuration", () => {
    const ok = evaluateConfig({ SESSION_SECRET: "x".repeat(40), COPERNICA_TOKEN_ENCRYPTION_KEY: "ab".repeat(32), CRON_SECRET: "y".repeat(40) });
    expect(worstStatus(ok)).toBe("ok");
    const weak = evaluateConfig({ SESSION_SECRET: "short", COPERNICA_TOKEN_ENCRYPTION_KEY: "ab".repeat(32), CRON_SECRET: "y".repeat(10) });
    expect(weak.map((finding) => finding.status)).toEqual(["critical", "ok", "warning"]);
  });

  it("checks headers, open routes and the certificate", () => {
    const good = { "Strict-Transport-Security": "max-age=31536000", "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin" };
    expect(evaluateHeaders(good).status).toBe("ok");
    expect(evaluateHeaders({ ...good, "X-Powered-By": "Next.js" }).status).toBe("warning");
    expect(evaluateHeaders({ ...good, "Content-Security-Policy": "script-src 'unsafe-eval'; frame-ancestors 'none'" }).status).toBe("warning");
    expect(evaluateAccess([{ path: "/dashboard/admin", expected: "login-redirect", status: 307, location: "/login" }, { path: "/api/cron/rfm", expected: "unauthorized", status: 401, location: null }]).status).toBe("ok");
    expect(evaluateAccess([{ path: "/dashboard/admin", expected: "login-redirect", status: 200, location: null }]).status).toBe("critical");
    const now = new Date("2026-10-13T00:00:00Z");
    expect(evaluateCertificate(new Date("2026-12-01T00:00:00Z"), now).status).toBe("ok");
    expect(evaluateCertificate(new Date("2026-10-25T00:00:00Z"), now).status).toBe("warning");
    expect(evaluateCertificate(new Date("2026-10-15T00:00:00Z"), now).status).toBe("critical");
  });

  it("rates accounts, sign-in activity and known vulnerabilities", () => {
    expect(evaluateMfa([], 5).status).toBe("ok");
    expect(evaluateMfa([{ role: "ADMIN", email: "a@x.nl" }], 5).detail).toContain("a@x.nl");
    const quiet = { loginFailed: 3, loginSuccess: 40, mfaFailed: 1, locked: 0, resets: 1, mfaResets: 0, maxFailedPerIp: 2, distinctFailedIps: 2 };
    expect(evaluateActivity(quiet).status).toBe("ok");
    expect(evaluateActivity({ ...quiet, locked: 1 }).status).toBe("warning");
    expect(evaluateActivity({ ...quiet, loginFailed: 250, maxFailedPerIp: 240 }).status).toBe("critical");
    expect(evaluateDependencies([], 150).status).toBe("ok");
    expect(evaluateDependencies([{ id: "GHSA-1", packageName: "x", version: "1.0.0", summary: "", severity: "HIGH" }], 150).status).toBe("warning");
    expect(evaluateDependencies([{ id: "GHSA-2", packageName: "x", version: "1.0.0", summary: "", severity: "CRITICAL" }], 150).status).toBe("critical");
    expect(evaluateDependencies(null, 150).status).toBe("warning");
  });
});
