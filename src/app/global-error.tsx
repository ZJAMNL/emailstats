"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="nl">
      <body>
        <main className="error-page">
          <p className="eyebrow">Er ging iets mis</p>
          <h1>De service is tijdelijk niet bereikbaar.</h1>
          <p>Probeer het opnieuw. Als het probleem blijft bestaan, neem dan contact op met de beheerder.</p>
          <button type="button" onClick={() => reset()} className="button button-primary">Opnieuw proberen</button>
        </main>
      </body>
    </html>
  );
}
