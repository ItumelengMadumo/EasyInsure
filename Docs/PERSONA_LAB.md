# Developer View As Simulator

The simulator lets a real EasyInsure developer see and exercise every role’s frontend workflow without impersonation or backend business authority.

## Enable and open

Set `VITE_APP_ENV=dev` on the Amplify `dev` branch. Local Vite development enables it automatically. Sign in with an account whose single Cognito business group and profile role are both `developer`.

The header then displays a persistent **View as** toolbar. Select a persona and scenario from any page, or open **Persona Lab** for role summaries, guided checklists and real-account details.

Staging and production must not set `VITE_APP_ENV=dev`. Superusers do not receive the simulator.

## How simulation works

- The signed-in developer identity remains visible beside the simulated identity.
- Real page components render against a deterministic portfolio.
- Page commands are routed to the local simulation adapter instead of Amplify.
- Simulated file uploads create metadata only; file bytes never leave the browser.
- Claims, applications, communications, assignments, assessments and decisions update in memory.
- **Reset** restores the selected scenario. **Return to developer** restores the live developer workspace.
- Browser refresh reconstructs the selected scenario from `viewAs` and `scenario` URL parameters and discards local actions.

Example:

```text
?page=claims&viewAs=intermediate_officer&scenario=claim-assessment
```

Preview parameters are ignored unless the authenticated and profile roles both resolve to developer in an enabled development environment.

## Scenario catalogue

The catalogue covers empty onboarding, asset applications, underwriting information requests, quote acceptance, active cover, claim drafts, unassigned claims, affidavit scanning, junior validation, information loops, assessment, senior decision, delivery failure, payment, closed cases, suspended accounts, access denied and identity conflict.

## Simulation versus authorization testing

- **Simulate workflow** validates navigation, controls, content, state progression and workflow clarity.
- **Test real authorization** validates Cognito and backend rules using a separate private-browser login.

Simulation never proves backend authorization. Developer simulation of a senior view still executes only the local adapter.

### Create or reconcile real development accounts

Use AWS credentials limited to the development user pool and designated secret:

```powershell
$env:EASYINSURE_ENV = 'dev'
$env:EASYINSURE_DEV_USER_POOL_ID = '<development user pool id>'
$env:EASYINSURE_PERSONA_SECRET_ID = 'easyinsure/dev/persona-credentials'
npm run personas:seed:dev
```

The command reconciles six users and their single group memberships, rotates passwords and writes credentials directly to AWS Secrets Manager.

## Refresh Amplify outputs

```powershell
$env:AMPLIFY_APP_ID = '<development app id>'
npm run outputs:dev
```

Environment-specific Amplify outputs remain ignored by Git and must not be copied between environments.

## Reporting a workflow mismatch

Record the persona, scenario, page, expected result, actual result, URL and screenshot. State whether the issue occurred in local simulation or a real Cognito session.
