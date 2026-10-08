import Link from "next/link";
import { BarChart3, BookOpen, Database, Gem, LayoutDashboard, LogOut, Mail, ShieldCheck, Users } from "lucide-react";
import { signOutAction, stopImpersonationAction } from "@/app/actions";
import { getSession } from "@/lib/session";
import { isRfmVisibleToCustomer } from "@/lib/rfm/history";
import { getTenantDashboardModules } from "@/lib/tenant-settings";
import { ThemeToggle } from "@/components/theme-toggle";

export async function DashboardShell({
  title,
  subtitle,
  children,
  role,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  role: "admin" | "customer";
}) {
  const session = await getSession();
  const modules = role === "customer" && session?.tenantId && process.env.DATABASE_URL
    ? await getTenantDashboardModules(session.tenantId).catch(() => null)
    : null;
  const showRfm = role === "customer" && session?.tenantId && process.env.DATABASE_URL
    ? await isRfmVisibleToCustomer(session.tenantId).catch(() => false)
    : false;
  const links = [
    { href: role === "admin" ? "/dashboard/admin" : "/dashboard/customer", label: "Overzicht", icon: LayoutDashboard },
    { href: role === "admin" ? "/dashboard/admin/clients" : "/dashboard/customer/data", label: role === "admin" ? "Klanten" : "Beheer", icon: role === "admin" ? Users : Database },
    { href: role === "admin" ? "/dashboard/admin/campaigns" : "/dashboard/customer/campaigns", label: "Campagnes", icon: Mail },
    ...(showRfm ? [{ href: "/dashboard/customer/rfm", label: "RFM-model", icon: Gem }] : []),
    ...(role === "customer" ? [{ href: "/dashboard/customer/uitleg", label: "Uitleg modellen", icon: BookOpen }] : []),
  ].filter((link) => link.href !== "/dashboard/customer/campaigns" || modules?.campaignStats !== false);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><BarChart3 size={18} /></div>
            <div><strong>E-mail Statistieken</strong><span>Klantenplatform</span></div>
        </div>
        <nav className="sidebar-nav" aria-label="Hoofdnavigatie">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="nav-item"><Icon size={18} />{label}</Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="security-pill"><ShieldCheck size={14} />{role === "admin" ? "Beheerder" : "Klantomgeving"}</div>
          <form action={signOutAction}>
            <button type="submit" className="logout-button"><LogOut size={16} /> Uitloggen</button>
          </form>
        </div>
      </aside>
      <main className="dashboard-main">
        {session?.impersonator ? <div className="impersonation-banner" role="status"><span>Je bekijkt dit dashboard als {session.name}. Beheerder: {session.impersonator.name}.</span><form action={stopImpersonationAction}><button className="button button-secondary" type="submit">Terug naar beheer</button></form></div> : null}
        <header className="topbar">
          <div><p className="eyebrow">Dashboard</p><h1>{title}</h1><p className="subtitle">{subtitle}</p></div>
          <div className="topbar-actions"><ThemeToggle /><div className="status-chip"><span /> Beveiligde omgeving</div></div>
        </header>
        {children}
      </main>
    </div>
  );
}
