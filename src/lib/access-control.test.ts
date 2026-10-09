import { describe, expect, it } from "vitest";
import { canAccessTenant } from "./access-control";

const ownedByAdmin = { id: "tenant-1", ownerId: "admin-1" };
const ownedByOther = { id: "tenant-2", ownerId: "admin-2" };
const unowned = { id: "tenant-3", ownerId: null };

describe("tenant access control", () => {
  it("allows a superadmin to view every tenant", () => {
    const viewer = { role: "superadmin" as const, userId: "super-1", tenantId: null };
    expect(canAccessTenant(viewer, ownedByAdmin)).toBe(true);
    expect(canAccessTenant(viewer, ownedByOther)).toBe(true);
    expect(canAccessTenant(viewer, unowned)).toBe(true);
  });

  it("allows an admin to view only the tenants they own", () => {
    const viewer = { role: "admin" as const, userId: "admin-1", tenantId: null };
    expect(canAccessTenant(viewer, ownedByAdmin)).toBe(true);
    expect(canAccessTenant(viewer, ownedByOther)).toBe(false);
    expect(canAccessTenant(viewer, unowned)).toBe(false);
  });

  it("allows a customer to view only their own tenant", () => {
    const viewer = { role: "customer" as const, userId: "user-1", tenantId: "tenant-1" };
    expect(canAccessTenant(viewer, ownedByAdmin)).toBe(true);
    expect(canAccessTenant(viewer, ownedByOther)).toBe(false);
  });

  it("denies an anonymous session access to a tenant", () => {
    expect(canAccessTenant({ role: "anonymous", userId: null, tenantId: null }, ownedByAdmin)).toBe(false);
  });
});
