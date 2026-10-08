import Link from "next/link";
import { BarChart3, BellRing, CalendarRange, Database, Gem, GitCompareArrows, LineChart, LockKeyhole, MailOpen, MousePointerClick, Plug, ShieldCheck, Sparkles, TrendingUp, Users } from "lucide-react";
import { DemoRequestForm } from "@/components/demo-request-form";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = {
  title: { absolute: "E-mail Statistieken | Inzicht in je e-mailmarketing" },
  description: "Eén dashboard voor de groei van je database en de resultaten van je e-mailcampagnes, rechtstreeks uit Copernica.",
};

const features = [
  { icon: Database, title: "Groei van je database", text: "Volg per selectie hoeveel profielen er zijn en zie per dag, week, maand of jaar wat er veranderd is." },
  { icon: MailOpen, title: "Campagneresultaten", text: "Verzonden e-mails, open rates en click-through rates per mailing, voor elke periode die je kiest." },
  { icon: GitCompareArrows, title: "Verhoudingen die ertoe doen", text: "Zet selecties tegen elkaar af, zoals opt-ins ten opzichte van je totale database, en volg het verloop in procentpunten." },
  { icon: Gem, title: "RFM-segmenten", text: "Elke klant in een van elf segmenten, van Kampioenen tot Risico, op basis van hoe recent, hoe vaak en voor hoeveel hij kocht. Met een concrete aanpak per segment." },
  { icon: TrendingUp, title: "Voorspelde klantwaarde", text: "Per klant de verwachte omzet voor de komende twaalf maanden en de kans dat hij nog actief is. Opgeteld: wat je database écht waard is." },
  { icon: CalendarRange, title: "Cohortanalyse", text: "Volg klanten vanaf hun eerste aankoop: wie komt terug, wat levert een klant op na 3, 6 en 12 maanden, en worden nieuwe klanten beter?" },
];

const benefits = [
  { icon: LineChart, title: "Zie trends voordat ze een probleem worden", text: "Een stijgend aantal uitschrijvingen of een dalend opt-inpercentage valt direct op, niet pas bij de kwartaalrapportage." },
  { icon: Users, title: "Praat met cijfers in plaats van gevoel", text: "Iedereen in je team kijkt naar dezelfde actuele aantallen. Geen losse exports en spreadsheets meer." },
  { icon: MousePointerClick, title: "Weet wat je database waard is", text: "Niet alleen hoeveel profielen je hebt, maar hoeveel omzet ze de komende twaalf maanden naar verwachting opleveren, en welke klanten je moet terugwinnen." },
  { icon: BellRing, title: "Altijd actueel, zonder handwerk", text: "De cijfers worden elke nacht automatisch bijgewerkt vanuit Copernica. Jij hoeft alleen maar te kijken." },
];

const steps = [
  { icon: Plug, title: "Koppelen", text: "We verbinden het dashboard veilig met je Copernica-database. Je API-token wordt versleuteld opgeslagen." },
  { icon: Sparkles, title: "Kiezen", text: "Je kiest welke selecties en campagnes je wilt volgen. Staan je orders in Copernica, dan rekenen we ook RFM, klantwaarde en cohorten door." },
  { icon: BarChart3, title: "Inzicht", text: "Vanaf dat moment zie je elke dag de ontwikkeling van je database en je e-mailresultaten in één overzicht." },
];

export default function Home() {
  return (
    <div className="landing-page">
      <header className="top-nav">
        <Link className="brand" href="/"><span className="brand-mark"><BarChart3 size={16} /></span>E-mail Statistieken</Link>
        <nav aria-label="Hoofdmenu">
          <a className="landing-nav-link" href="#functies">Functies</a>
          <a className="landing-nav-link" href="#voordelen">Wat het oplevert</a>
          <a className="landing-nav-link" href="#demo">Demo</a>
          <ThemeToggle />
          <Link className="button button-secondary" href="/login">Inloggen</Link>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Dashboard voor e-mailmarketing</p>
            <h1>Je e‑mailmarketing in één oogopslag.</h1>
            <p className="hero-text">Zie hoe je database groeit, hoe je campagnes presteren en wat je klanten de komende twaalf maanden waard zijn. Met RFM-segmenten, voorspelde klantwaarde en cohortanalyse, rechtstreeks uit Copernica en elke dag bijgewerkt.</p>
            <div className="hero-actions">
              <a className="button button-primary button-large" href="#demo">Demo aanvragen</a>
              <Link className="button button-secondary button-large" href="/login">Inloggen</Link>
            </div>
            <ul className="trust-list">
              <li>Dagelijks bijgewerkt</li>
              <li>Alleen jouw eigen data</li>
              <li>Werkt met Copernica</li>
              <li>Voorspelt klantwaarde</li>
            </ul>
          </div>
          <DashboardPreview />
        </section>

        <section className="feature-section" id="functies">
          <div className="section-heading">
            <p className="eyebrow">Wat je ziet</p>
            <h2>Van je mailings tot de waarde van elke klant.</h2>
          </div>
          <div className="feature-grid">
            {features.map(({ icon: Icon, title, text }) => <article className="feature-card" key={title}><Icon size={24} /><h3>{title}</h3><p>{text}</p></article>)}
          </div>
        </section>

        <section className="feature-section" id="voordelen">
          <div className="section-heading">
            <p className="eyebrow">Wat het voor je betekent</p>
            <h2>Minder zoeken, sneller bijsturen.</h2>
          </div>
          <div className="benefit-grid">
            {benefits.map(({ icon: Icon, title, text }) => <article className="benefit-card" key={title}><span className="benefit-icon"><Icon size={20} /></span><div><h3>{title}</h3><p>{text}</p></div></article>)}
          </div>
        </section>

        <section className="feature-section">
          <div className="section-heading">
            <p className="eyebrow">Zo werkt het</p>
            <h2>In drie stappen aan de slag.</h2>
          </div>
          <ol className="step-list">
            {steps.map(({ icon: Icon, title, text }, index) => <li key={title}><span className="step-number">{index + 1}</span><Icon size={22} /><h3>{title}</h3><p>{text}</p></li>)}
          </ol>
        </section>

        <section className="security-section">
          <div className="security-panel">
            <div><p className="eyebrow">Veilig en afgeschermd</p><h2>Jouw data blijft van jou.</h2></div>
            <div className="security-points">
              <span><LockKeyhole size={14} /> Versleutelde koppeling</span>
              <span><ShieldCheck size={14} /> Eigen afgeschermde omgeving</span>
              <span><Users size={14} /> Alleen toegang voor jouw team</span>
            </div>
          </div>
        </section>

        <section className="demo-section" id="demo">
          <div className="demo-intro">
            <p className="eyebrow">Demo aanvragen</p>
            <h2>Benieuwd wat het dashboard voor jou kan doen?</h2>
            <p>Laat je gegevens achter. We laten je in een korte online demo zien hoe het werkt, met voorbeelden die passen bij jouw situatie.</p>
            <ul className="demo-points">
              <li>Persoonlijke demo van ongeveer 30 minuten</li>
              <li>Antwoord binnen twee werkdagen</li>
              <li>Vrijblijvend</li>
            </ul>
          </div>
          <div className="demo-card"><DemoRequestForm /></div>
        </section>
      </main>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} E-mail Statistieken</span>
        <Link href="/login">Inloggen voor klanten</Link>
      </footer>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="hero-visual" aria-label="Voorbeeld van het dashboard" role="img">
      <div className="dashboard-window preview-window">
        <div className="window-bar"><span /><span /><span /><small className="preview-label">Voorbeeldcijfers</small></div>
        <div className="preview-grid">
          <div className="tile preview-total">
            <span>Databasebeheer</span>
            <strong>42.068</strong>
            <em>+1.204 (+2,9%) sinds vorige maand</em>
            <svg className="preview-chart" viewBox="0 0 320 110" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="preview-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#4cc9a7" stopOpacity=".35" />
                  <stop offset="100%" stopColor="#4cc9a7" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 92 C40 88 60 80 95 74 S150 60 185 52 S250 36 320 22 L320 110 L0 110 Z" fill="url(#preview-fill)" />
              <path d="M0 92 C40 88 60 80 95 74 S150 60 185 52 S250 36 320 22" fill="none" stroke="#4cc9a7" strokeWidth="2.5" />
              <path d="M0 100 C50 98 80 92 120 88 S200 80 250 72 S300 66 320 62" fill="none" stroke="#7c6df2" strokeWidth="2" strokeDasharray="5 5" />
            </svg>
          </div>
          <div className="tile">
            <span>A_Optin</span>
            <strong>22.041</strong>
            <div className="preview-ratio"><b>52,4%</b> van Databasebeheer</div>
            <em>+0,8 pt sinds vorig jaar</em>
          </div>
          <div className="tile preview-clv">
            <span>Databasewaarde</span>
            <strong>€ 1,24 mln</strong>
            <div className="preview-ratio"><b>78%</b> van de kopers nog actief</div>
            <em>Voorspeld, komende 12 maanden</em>
          </div>
          <div className="tile preview-cohort">
            <span>Herhaalaankopen na eerste aankoop</span>
            <div className="preview-cohort-grid" aria-hidden="true">
              {[[24, 15, 12, 10, 9, 8], [27, 18, 14, 11, 10], [31, 20, 16, 13], [33, 22, 17]].map((row, rowIndex) => <div key={rowIndex}>{row.map((share, index) => <i key={index} style={{ opacity: 0.25 + share / 40 }}>{share}%</i>)}</div>)}
            </div>
            <em>Nieuwe klanten komen steeds vaker terug</em>
          </div>
        </div>
      </div>
    </div>
  );
}
