/** Pure evaluations for the weekly security test, kept apart from fetching so they can be tested. */

export type FindingStatus = "ok" | "warning" | "critical";
export type Finding = { id: string; area: string; title: string; status: FindingStatus; detail: string; advice?: string };

const rank: Record<FindingStatus, number> = { ok: 0, warning: 1, critical: 2 };

export function worstStatus(findings: Finding[]): FindingStatus {
  return findings.reduce<FindingStatus>((worst, finding) => (rank[finding.status] > rank[worst] ? finding.status : worst), "ok");
}

export function sortFindings(findings: Finding[]) {
  return [...findings].sort((left, right) => rank[right.status] - rank[left.status]);
}

export function evaluateConfig(env: Record<string, string | undefined>): Finding[] {
  const findings: Finding[] = [];
  const session = env.SESSION_SECRET ?? "";
  findings.push(session.length >= 32
    ? { id: "config-session", area: "Configuratie", title: "Sessiesleutel", status: "ok", detail: "SESSION_SECRET is ingesteld en lang genoeg." }
    : { id: "config-session", area: "Configuratie", title: "Sessiesleutel", status: "critical", detail: "SESSION_SECRET ontbreekt of is korter dan 32 tekens.", advice: "Stel een willekeurige sleutel van minimaal 32 tekens in." });
  findings.push(/^[a-f0-9]{64}$/i.test(env.COPERNICA_TOKEN_ENCRYPTION_KEY ?? "")
    ? { id: "config-encryption", area: "Configuratie", title: "Versleutelingssleutel", status: "ok", detail: "Copernica-tokens en 2FA-sleutels worden met AES-256-GCM versleuteld." }
    : { id: "config-encryption", area: "Configuratie", title: "Versleutelingssleutel", status: "critical", detail: "COPERNICA_TOKEN_ENCRYPTION_KEY ontbreekt of is geen 32-byte hex-waarde.", advice: "Stel een sleutel van 64 hex-tekens in." });
  const cron = env.CRON_SECRET ?? "";
  findings.push(cron.length >= 32
    ? { id: "config-cron", area: "Configuratie", title: "Cron-geheim", status: "ok", detail: "CRON_SECRET is ingesteld en lang genoeg." }
    : { id: "config-cron", area: "Configuratie", title: "Cron-geheim", status: cron ? "warning" : "critical", detail: cron ? "CRON_SECRET is korter dan 32 tekens." : "CRON_SECRET ontbreekt: de nachtelijke taken zijn niet afgeschermd.", advice: "Stel een willekeurig geheim van minimaal 32 tekens in." });
  return findings;
}

const requiredHeaders: { name: string; test: (value: string) => boolean; label: string }[] = [
  { name: "strict-transport-security", test: (value) => /max-age=(\d+)/.test(value) && Number(/max-age=(\d+)/.exec(value)![1]) >= 15552000, label: "HSTS (minimaal 180 dagen)" },
  { name: "content-security-policy", test: (value) => value.includes("frame-ancestors 'none'") && !value.includes("'unsafe-eval'"), label: "Content-Security-Policy zonder unsafe-eval" },
  { name: "x-content-type-options", test: (value) => value.toLowerCase() === "nosniff", label: "X-Content-Type-Options: nosniff" },
  { name: "x-frame-options", test: (value) => value.toUpperCase() === "DENY", label: "X-Frame-Options: DENY" },
  { name: "referrer-policy", test: (value) => value.length > 0, label: "Referrer-Policy" },
];

export function evaluateHeaders(headers: Record<string, string>): Finding {
  const lower = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  const missing = requiredHeaders.filter((header) => !header.test(lower[header.name] ?? "")).map((header) => header.label);
  if (lower["x-powered-by"]) missing.push(`geen X-Powered-By (nu: ${lower["x-powered-by"]})`);
  return missing.length
    ? { id: "headers", area: "Website", title: "Beveiligingsheaders", status: "warning", detail: `Ontbreekt of te zwak: ${missing.join(", ")}.`, advice: "Controleer src/proxy.ts en next.config.ts." }
    : { id: "headers", area: "Website", title: "Beveiligingsheaders", status: "ok", detail: "HSTS, CSP, X-Frame-Options, nosniff en Referrer-Policy staan goed." };
}

export type AccessProbe = { path: string; expected: "login-redirect" | "unauthorized"; status: number; location: string | null };

export function evaluateAccess(probes: AccessProbe[]): Finding {
  const open = probes.filter((probe) => probe.expected === "login-redirect"
    ? !(probe.status >= 300 && probe.status < 400 && (probe.location ?? "").includes("/login"))
    : probe.status !== 401);
  return open.length
    ? { id: "access", area: "Toegang", title: "Afgeschermde pagina's en taken", status: "critical", detail: `Bereikbaar zonder inloggen: ${open.map((probe) => `${probe.path} (${probe.status})`).join(", ")}.`, advice: "Controleer direct de sessie- en cron-controle van deze routes." }
    : { id: "access", area: "Toegang", title: "Afgeschermde pagina's en taken", status: "ok", detail: `${probes.length} routes getest: dashboards sturen door naar de login, nachtelijke taken weigeren zonder geheim.` };
}

export function evaluateCertificate(validTo: Date | null, now = new Date()): Finding {
  if (!validTo) return { id: "tls", area: "Website", title: "TLS-certificaat", status: "warning", detail: "Het certificaat kon niet worden opgehaald.", advice: "Controleer of het domein bereikbaar is via HTTPS." };
  const days = Math.floor((validTo.getTime() - now.getTime()) / 86_400_000);
  if (days < 7) return { id: "tls", area: "Website", title: "TLS-certificaat", status: "critical", detail: `Verloopt over ${days} dagen (${validTo.toLocaleDateString("nl-NL")}).`, advice: "Controleer de domeininstellingen in Vercel; het certificaat wordt normaal automatisch vernieuwd." };
  if (days < 21) return { id: "tls", area: "Website", title: "TLS-certificaat", status: "warning", detail: `Verloopt over ${days} dagen (${validTo.toLocaleDateString("nl-NL")}).`, advice: "Vercel vernieuwt normaal 30 dagen vooraf; controleer de domeininstellingen." };
  return { id: "tls", area: "Website", title: "TLS-certificaat", status: "ok", detail: `Geldig tot ${validTo.toLocaleDateString("nl-NL")} (nog ${days} dagen).` };
}

export function evaluateMfa(withoutMfa: { role: string; email: string }[], total: number): Finding {
  const admins = withoutMfa.filter((user) => user.role !== "CUSTOMER");
  const customers = withoutMfa.length - admins.length;
  if (!withoutMfa.length) return { id: "mfa", area: "Accounts", title: "Tweestapsverificatie", status: "ok", detail: `Alle ${total} accounts gebruiken tweestapsverificatie.` };
  return {
    id: "mfa",
    area: "Accounts",
    title: "Tweestapsverificatie",
    status: "warning",
    detail: `${withoutMfa.length} van ${total} accounts hebben nog geen authenticator-app ingesteld${admins.length ? ` (beheerders: ${admins.map((user) => user.email).join(", ")})` : ""}${customers ? `, waarvan ${customers} klantgebruikers` : ""}. Zij moeten dit doen bij hun volgende login.`,
    advice: "Wie zijn wachtwoord kent, kan de app als eerste koppelen. Vraag deze gebruikers om snel in te loggen, of verwijder accounts die niet meer nodig zijn.",
  };
}

export type ActivityCounts = { loginFailed: number; loginSuccess: number; mfaFailed: number; locked: number; resets: number; mfaResets: number; maxFailedPerIp: number; distinctFailedIps: number };

export function evaluateActivity(counts: ActivityCounts): Finding {
  const summary = `Afgelopen 7 dagen: ${counts.loginSuccess} geslaagde logins, ${counts.loginFailed} mislukte wachtwoorden (vanaf ${counts.distinctFailedIps} adressen), ${counts.mfaFailed} onjuiste 2FA-codes, ${counts.locked} blokkades, ${counts.resets} wachtwoordherstel-mails, ${counts.mfaResets} 2FA-resets.`;
  if (counts.loginFailed >= 200 || counts.maxFailedPerIp >= 100) return { id: "activity", area: "Inlogactiviteit", title: "Inlogpogingen", status: "critical", detail: summary, advice: "Dit wijst op een gerichte aanval (password spraying of brute force). Controleer het logboek en overweeg extra blokkering in de Vercel Firewall." };
  if (counts.locked > 0 || counts.loginFailed >= 50 || counts.mfaFailed >= 20) return { id: "activity", area: "Inlogactiviteit", title: "Inlogpogingen", status: "warning", detail: summary, advice: "Controleer of de geblokkeerde accounts zelf hun wachtwoord vergaten; neem anders contact op met de gebruiker." };
  return { id: "activity", area: "Inlogactiviteit", title: "Inlogpogingen", status: "ok", detail: summary };
}

export function evaluateAccounts(stale: { email: string; role: string }[], newAdmins: { email: string; role: string }[], superadmins: number): Finding[] {
  const findings: Finding[] = [];
  findings.push(stale.length
    ? { id: "stale", area: "Accounts", title: "Slapende accounts", status: "warning", detail: `${stale.length} accounts zijn al 90 dagen niet gebruikt: ${stale.slice(0, 10).map((user) => user.email).join(", ")}${stale.length > 10 ? " …" : ""}.`, advice: "Verwijder accounts die niet meer nodig zijn; elk ongebruikt account is een extra ingang." }
    : { id: "stale", area: "Accounts", title: "Slapende accounts", status: "ok", detail: "Geen accounts die langer dan 90 dagen ongebruikt zijn." });
  findings.push(newAdmins.length
    ? { id: "new-admins", area: "Accounts", title: "Nieuwe beheerders", status: "warning", detail: `Deze week toegevoegd: ${newAdmins.map((user) => `${user.email} (${user.role === "SUPERADMIN" ? "superbeheerder" : "beheerder"})`).join(", ")}.`, advice: "Controleer of deze beheerders bewust zijn aangemaakt." }
    : { id: "new-admins", area: "Accounts", title: "Nieuwe beheerders", status: "ok", detail: `Geen nieuwe beheerders deze week; ${superadmins} ${superadmins === 1 ? "superbeheerder" : "superbeheerders"} in totaal.` });
  if (superadmins > 3) findings.push({ id: "superadmins", area: "Accounts", title: "Aantal superbeheerders", status: "warning", detail: `${superadmins} superbeheerders hebben toegang tot alle klanten.`, advice: "Houd dit zo klein mogelijk; geef beheerders waar het kan de gewone beheerdersrol." });
  return findings;
}

export type Vulnerability = { id: string; packageName: string; version: string; summary: string; severity: string };

export function evaluateDependencies(vulnerabilities: Vulnerability[] | null, scanned: number): Finding {
  if (vulnerabilities === null) return { id: "dependencies", area: "Software", title: "Bekende kwetsbaarheden", status: "warning", detail: "De kwetsbaarhedendatabase (OSV) was niet bereikbaar.", advice: "Draai lokaal `npm audit --omit=dev`." };
  if (!vulnerabilities.length) return { id: "dependencies", area: "Software", title: "Bekende kwetsbaarheden", status: "ok", detail: `${scanned} pakketten die in productie draaien gecontroleerd: geen bekende kwetsbaarheden. Build-tools zoals de Prisma CLI vallen hierbuiten; controleer die met npm audit.` };
  const serious = vulnerabilities.some((vulnerability) => /critical/i.test(vulnerability.severity));
  return {
    id: "dependencies",
    area: "Software",
    title: "Bekende kwetsbaarheden",
    status: serious ? "critical" : "warning",
    detail: `${vulnerabilities.length} bekende kwetsbaarheden in ${new Set(vulnerabilities.map((vulnerability) => vulnerability.packageName)).size} van ${scanned} pakketten: ${vulnerabilities.slice(0, 8).map((vulnerability) => `${vulnerability.packageName}@${vulnerability.version} – ${vulnerability.id}${vulnerability.severity ? ` (${vulnerability.severity})` : ""}`).join("; ")}${vulnerabilities.length > 8 ? " …" : ""}.`,
    advice: "Werk de pakketten bij (npm update / npm audit fix) en controleer of de kwetsbare code in productie wordt gebruikt.",
  };
}
