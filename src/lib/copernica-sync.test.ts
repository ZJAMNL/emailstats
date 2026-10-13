import { describe, expect, it, vi } from "vitest";

vi.mock("./prisma", () => ({ getPrismaClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
const { isSettled } = await import("./copernica");

describe("settled campaign statistics", () => {
  const now = new Date("2026-10-13T04:00:00Z");
  it("refreshes recent mailings and settles old ones after one fetch with unique counts", () => {
    expect(isSettled(new Date("2026-10-01T09:00:00Z"), new Date("2026-10-12T04:00:00Z"), now)).toBe(false);
    expect(isSettled(new Date("2026-08-01T09:00:00Z"), new Date("2026-10-12T04:00:00Z"), now)).toBe(true);
    // Last fetched before the month was over: fetch once more.
    expect(isSettled(new Date("2026-09-01T09:00:00Z"), new Date("2026-09-20T04:00:00Z"), now)).toBe(false);
    // Fetched before unique opens were counted: fetch once more.
    expect(isSettled(new Date("2026-06-01T09:00:00Z"), new Date("2026-10-09T04:00:00Z"), now)).toBe(false);
  });
});
