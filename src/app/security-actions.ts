"use server";

import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/admin-access";
import { getAppUrl } from "@/lib/app-url";
import { runSecurityScan } from "@/lib/security/scan";

/** Runs the security test now; with `mail` the superbeheerders get the report, as on Monday. */
export async function runSecurityScanAction(formData: FormData) {
  await requireSuperAdmin();
  await runSecurityScan({ baseUrl: await getAppUrl(), trigger: "handmatig", sendMail: formData.get("mail") === "on" });
  redirect("/dashboard/admin/beveiliging?notice=scanned");
}
