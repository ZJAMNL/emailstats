import Link from "next/link";

/** Tabs within Beheer: the Copernica connection and selections, and the choice of e-mail campaigns. */
export function CustomerDataTabs({ current, showCampaigns }: { current: "copernica" | "campagnes"; showCampaigns: boolean }) {
  if (!showCampaigns) return null;
  return (
    <nav aria-label="Beheer" className="segmented-control customer-data-tabs">
      <Link aria-current={current === "copernica" ? "page" : undefined} href="/dashboard/customer/data">Copernica en selecties</Link>
      <Link aria-current={current === "campagnes" ? "page" : undefined} href="/dashboard/customer/data/campagnes">E-mailcampagnes</Link>
    </nav>
  );
}
