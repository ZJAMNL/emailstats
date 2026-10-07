import { describe, expect, it } from "vitest";
import { canAccessTenant, type Role } from "./access-control";

describe("tenant access control", () => {
  it("allows an administrator to view every tenant", () => {
    expect(canAccessTenant("admin" as Role, "tenant-1", "tenant-1")).toBe(true);
    expect(canAccessTenant("admin" as Role, "tenant-1", "tenant-2")).toBe(true);
  });

  it("allows a customer to view only their own tenant", () => {
    expect(canAccessTenant("customer" as Role, "tenant-1", "tenant-1")).toBe(true);
    expect(canAccessTenant("customer" as Role, "tenant-1", "tenant-2")).toBe(false);
  });

  it("denies an anonymous session access to a tenant", () => {
    expect(canAccessTenant("anonymous" as Role, "tenant-1", "tenant-1")).toBe(false);
  });
});
