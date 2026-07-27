# Persona Lab

Persona Lab is a development-only workflow-audit surface for developers and superusers. It renders the real EasyInsure pages with deterministic synthetic portfolios; it is not impersonation and does not validate Cognito authorization.

## Enable and open

Set `VITE_APP_ENV=dev` on the Amplify `dev` branch. Local Vite development enables the lab automatically. Sign in as a user whose single Cognito business group and profile role are `developer` or `superuser`, then choose **Persona Lab** in the navigation.

Staging and production must not set `VITE_APP_ENV=dev`.

## Preview versus real accounts

- **Preview workspace** is for inspecting navigation, language, empty/error expectations, timelines and workflow clarity. Its fixture adapter rejects model writes and custom mutations, and form submissions are stopped before uploads.
- **Real account testing** is for authorization. Open a private browser window, sign in with the development account shown in the lab, and retrieve its password from the approved development secret store. Never add passwords to source control or browser code.

The Golden Journey includes draft and information-needed applications, active cover, unassigned/validating/assessment/decision/closed claims, assignment history, evidence, internal notes and a failed mock email.

### Create or reconcile real development accounts

Use AWS credentials that can administer only the development user pool and the designated development secret:

```powershell
$env:EASYINSURE_ENV = 'dev'
$env:EASYINSURE_DEV_USER_POOL_ID = '<development user pool id>'
$env:EASYINSURE_PERSONA_SECRET_ID = 'easyinsure/dev/persona-credentials'
npm run personas:seed:dev
```

The command is idempotent for user and group membership. It rotates every persona password on each run and writes the new values directly to AWS Secrets Manager. First login creates the persona's platform profile through the normal application command. Golden Journey business records remain isolated fixtures in preview mode; real accounts are intended for authorization and for manually exercising live dev mutations.

## Refresh Amplify outputs

The repository ignores environment-specific `amplify_outputs.json`. To obtain current development outputs:

```powershell
$env:AMPLIFY_APP_ID = '<development app id>'
npm run outputs:dev
```

Do not copy sandbox or development outputs into Staging or production.

## Review method

Select each persona, start its preview, and work through the checklist. Checklist completion is stored only in the browser session. Record workflow mismatches with the persona, page, expected result, actual result, screenshot and whether it occurred in preview or a real Cognito session.

To reset synthetic preview data, exit and reopen the preview. Preview records never coexist with live backend records and cannot delete development data.
