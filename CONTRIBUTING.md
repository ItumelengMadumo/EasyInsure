# Contributing to EasyInsure

## Mandatory delivery path

All normal work follows:

`feature/EI-####-slug → dev → Staging → main`

- Create one GitHub issue per ticket.
- Create the feature or bugfix branch from the latest passing `dev`.
- Never push directly to `dev`, `Staging`, or `main`.
- Feature and bugfix pull requests target `dev` and use squash merge.
- Passing `dev` revisions are promoted automatically through a merge PR to `Staging`.
- Production uses an approved merge PR from `Staging` to `main`.
- Do not mix unrelated tickets in one branch.

## Branch names

- `feature/EI-####-short-description`
- `bugfix/EI-####-short-description`
- `hotfix/EI-####-short-description`

Hotfixes target `main` only when production impact makes the normal path unsafe. The resulting
production commit must be synchronized back into `dev`.

## Required local checks

```bash
npm ci
npm run verify
```

New commands require authorization tests for allowed and forbidden roles. Mutations require
idempotency, correlation, audit behavior, and compatible migration/rollback notes.

## Pull requests

- Link the EI/GitHub issue.
- Complete every relevant template section.
- Attach screenshots or recordings for visual work.
- Describe schema compatibility, deployment, monitoring, and rollback.
- Never commit secrets, production payloads, recordings, or customer data.
- Resolve every review conversation before merge.

## Releases

Staging is the release candidate. A release reaches `main` only after Staging acceptance passes
and a human approves the production environment and pull request. Production is tagged using the
manual release workflow after post-deployment validation.
