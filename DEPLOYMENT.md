# GitHub en Vercel deployment

## 1. Repository voorbereiden

1. Maak een nieuwe publieke of private GitHub-repository aan.
2. Koppel de lokale checkout:

```bash
git remote add origin https://github.com/<owner>/<repository>.git
git branch -M main
git push -u origin main
```

3. Zorg dat de branch `main` de default branch is.
4. Activeer GitHub Actions in de repository-instellingen.

## 2. Vercel-project aanmaken

1. Log in op Vercel met een beheerdersaccount.
2. Kies **Add New Project**.
3. Importeer de GitHub-repository.
4. Selecteer de volgende instellingen:
   - Framework: Next.js
   - Root Directory: `.`
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Install Command: `npm ci`
5. Onder **Environment Variables** voeg je minimaal deze waarden toe:

```text
SESSION_SECRET=<een willekeurige veilige waarde van minimaal 32 tekens>
NEXT_PUBLIC_SITE_URL=https://<jouw-domein>
DATABASE_URL=postgresql://<gebruiker>:<wachtwoord>@<host>:5432/<database>?sslmode=require
COPERNICA_API_URL=https://api.copernica.com
COPERNICA_API_KEY=<copernica-api-key>
COPERNICA_API_TOKEN=<copernica-access-token>
```

> De demo-wachtwoorden mogen nooit in productie worden gebruikt. Gebruik in productie een echte identity-provider of passwordless login.

## 3. GitHub Secrets configureren

In GitHub openen: **Settings → Secrets and variables → Actions**.

Voeg de volgende repositorysecrets toe:

```text
VERCEL_TOKEN=<vercel-personal-access-token>
VERCEL_ORG_ID=<vercel-organisatie-id>
VERCEL_PROJECT_ID=<vercel-project-id>
```

Gebruik geen `GITHUB_TOKEN`-secret; GitHub levert dat automatisch.

## 4. De Vercel IDs ophalen

Via de Vercel CLI:

```bash
npm install --global vercel
vercel login
vercel link
vercel env pull .env.local
```

De CLI toont de organisatie- en project-ID's. Je kunt deze ook terugvinden in de Vercel-projectinstellingen.

## 5. Deploymentflows

- Push naar `main`: productie-deploy via Vercel.
- Pull request: preview-deploy en automatische code review-commentaar.
- Push naar een willekeurige andere branch: alleen GitHub-verificatie, geen deployment.

## 6. Security checklist

- Geen secrets in code, logs of pull requests.
- Gebruik Vercel Environment Variables voor productie.
- Alleen de productieomgeving kan `--prod` deployen.
- Ratelimit externe API-calls.
- Sla geen Copernica-API-tokens op in client-side code.
- Gebruik een authenticated service voor databaseverkeer.
- Activeer GitHub branch protection met required status checks.
- Gebruik dependabot en GitHub Advanced Security.
- Controleer de Vercel Deployment Protection settings.
