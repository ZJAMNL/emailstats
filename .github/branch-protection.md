# Branch protection voor main

Voer deze instellingen in GitHub uit:

1. Open **Settings → Branches → Add branch protection rule**.
2. Kies `main` als branch.
3. Schakel in:
   - **Require a pull request before merging**
   - **Require approvals**: minimaal 1 review
   - **Dismiss stale PR approvals when new commits are pushed**
   - **Require status checks to pass before merging**
   - **Require branches to be up to date before merging**
   - **Require conversation resolution before merging**
   - **Restrict who can push to matching branches**
4. Selecteer de qua statuscontrole vereiste checks:
   - `quality`
   - `deploy`
5. Verwijder de mogelijkheid om commits rechtstreeks naar `main` te pushen.
6. Bescherm ook secret- en deployment-gerelateerde workflows met explicit repository-admins.

## Security policy

- Gebruik een minimale GitHub-tokenpermissie: `contents: read`, `pull-requests: write`.
- Haal geen API-sleutels op uit pull request logs.
- Gebruik GitHub Environment Protection Rules voor production.
- Gebruik Vercel Deployment Protection of Access Control voor preview-omgevingen.
- Laat alleen een approved deployment vanuit `main` door naar Vercel.
