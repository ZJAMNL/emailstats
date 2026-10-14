"use server";

import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/admin-access";
import { saveCostSettings } from "@/lib/costs/data";
import { readCostSettings } from "@/lib/costs/model";

const amount = (formData: FormData, key: string) => {
  const value = Number(String(formData.get(key) ?? "").replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
};

/** Saves the cost assumptions; only superbeheerders, as they apply to every beheerder's figures. */
export async function saveCostSettingsAction(formData: FormData) {
  await requireSuperAdmin();
  const labels = formData.getAll("fixedLabel").map((value) => String(value).trim());
  const amounts = formData.getAll("fixedAmount").map((value) => Number(String(value).replace(",", ".")));
  const packages = ["basis", "inzicht", "voorspellen"] as const;
  await saveCostSettings(readCostSettings({
    fixedCosts: labels.map((label, index) => ({ label, amount: amounts[index] })).filter((item) => item.label && Number.isFinite(item.amount)),
    computePerHour: amount(formData, "computePerHour"),
    storagePerGbMonth: amount(formData, "storagePerGbMonth"),
    emailPerThousand: amount(formData, "emailPerThousand"),
    supportRate: amount(formData, "supportRate"),
    supportHours: Object.fromEntries(packages.map((pkg) => [pkg, amount(formData, `hours-${pkg}`)])),
    prices: Object.fromEntries(packages.map((pkg) => [pkg, amount(formData, `price-${pkg}`)])),
    includedProfiles: amount(formData, "includedProfiles"),
    extraPer100k: { inzicht: amount(formData, "extra-inzicht"), voorspellen: amount(formData, "extra-voorspellen") },
    partnerDiscount: (amount(formData, "partnerDiscount") ?? 40) / 100,
  }));
  redirect("/dashboard/admin/kosten?notice=saved");
}
