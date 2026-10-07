import Link from "next/link";
import { BarChart3, Database, LayoutDashboard, LogOut, Mail, ShieldCheck, Users } from "lucide-react";
import { signOutAction } from "@/app/actions";

export function DashboardShell({
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
  const links = [
    { href: role === "admin" ? "/dashboard/admin" : "/dashboard/customer", label: "Overzicht", icon: LayoutDashboard },
    { href: role === "admin" ? "/dashboard/admin/clients" : "/dashboard/customer/data", label: role === "admin" ? "Klanten" : "Database", icon: role === "admin" ? Users : Database },
    { href: role === "admin" ? "/dashboard/admin/campaigns" : "/dashboard/customer/campaigns", label: "Campagnes", icon: Mail },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><BarChart3 size={18} /></div>
          <div><strong>MailMetrics</strong><span>Enterprise Suite</span></div>
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
        <header className="topbar">
          <div><p className="eyebrow">Dashboard</p><h1>{title}</h1><p className="subtitle">{subtitle}</p></div>
          <div className="status-chip"><span /> Live data</div>
        </header>
        {children}
      </main>
    </div>
  );
}
