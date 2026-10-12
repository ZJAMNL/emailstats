import { redirect } from "next/navigation";

/** Moved: this page is now part of "inzicht". */
export default async function Moved({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  redirect(`/dashboard/admin/clients/${encodeURIComponent(tenantId)}/inzicht`);
}
