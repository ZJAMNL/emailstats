/** A short summary that is always visible, and the details behind "Meer tonen" (native details, no script needed). */
export function ShowMore({ children, label = "Meer tonen" }: { children: React.ReactNode; label?: string }) {
  return (
    <details className="show-more">
      <summary><span className="show-more-closed">{label}</span><span className="show-more-open">Minder tonen</span></summary>
      <div className="show-more-body">{children}</div>
    </details>
  );
}

/** A section with a title, a one-line summary and optional details. */
export function SummarySection({ eyebrow, title, summary, children }: { eyebrow: string; title: string; summary: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="panel table-panel summary-section">
      <div className="panel-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div></div>
      <div className="summary-section-summary">{summary}</div>
      {children ? <ShowMore>{children}</ShowMore> : null}
    </section>
  );
}
