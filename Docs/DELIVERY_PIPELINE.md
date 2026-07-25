# EasyInsure delivery pipeline

## Promotion

```text
feature/EI-ticket --review+squash--> dev --automatic merge PR--> Staging
Staging --acceptance+approval merge PR--> main --Amplify--> production
```

`main` is never used as a feature base. `Staging` is never changed manually. `dev` accepts reviewed
ticket PRs only.

## Required GitHub settings

Run `scripts/configure-github.ps1` as a repository administrator after authenticating GitHub CLI.
Then connect the `dev`, `Staging`, and `main` branches in Amplify Hosting as isolated branch
environments. Set:

- Staging environment variable `STAGING_URL`.
- Production environment with a required reviewer.
- Amplify branch environment variables and provider secrets independently per environment.
- GitHub Actions setting to allow pull requests and auto-merge created by workflows.

## Rollback

- Development: revert the ticket squash commit through a PR.
- Staging: revert the promotion merge through a PR; do not rewrite the branch.
- Production: revert the release merge through an emergency PR and deploy the prior known-good
  commit. Open a defect and synchronize `main` back to `dev`.
- Database changes must be additive until every environment has completed migration and rollback
  compatibility has been demonstrated.
