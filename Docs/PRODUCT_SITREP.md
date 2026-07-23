# EasyInsure Product SITREP

**Reviewed:** 23 July 2026  
**Reference:** Master Product & Technical Specification v2.0  
**Current architecture:** React 18 + TypeScript frontend, AWS Amplify Gen 2 backend

## Executive assessment

EasyInsure has moved beyond a prototype backend. Its strongest production-shaped capability is the claims processing core: authenticated submission, idempotency, deterministic calculation, evidence quarantine, asynchronous orchestration, AI advisory output, senior-officer approval, and append-only audit events are all represented in code.

The largest gap was presentation coverage. The prior React UI exposed only Overview, Assets, Claims, and a minimal Review table from one file. It did not communicate the depth already present in the backend. This pass introduces a modular application surface for the operational areas supported by the current data model.

The application is not yet feature-complete against every item in the v2.0 specification. In particular, native mobile apps, offline sync, policy administration workflows, general KYC documents, notifications, bulk imports, advanced reporting, and full claim activity messaging remain roadmap work.

## Current module map

| Module | Current state | Notes |
| --- | --- | --- |
| Authentication | Implemented | Cognito-backed Amplify Authenticator; user-pool authorization |
| User profile | Partial | Profile view/edit and role display; 2FA and preference editing are not yet surfaced |
| Assets | Implemented core | Register, list, search, policy-link visibility; edit/delete/bulk import remain |
| Policies | Read experience | Policy, valuation, premium, term and linked-asset visibility; creation/renewal workflow remains |
| Claims | Implemented core | Submission, evidence upload, status filtering, detail timeline |
| Claim processing | Implemented | Step Functions workflow invokes deterministic engine and AI copilot |
| Human review | Implemented core | Review queue and senior-only approve/reject actions |
| Evidence | Implemented core | Quarantine upload, checksum metadata, scanning status and secure locker view |
| Premium estimator | Implemented core | Interactive excess and deterministic engine query |
| Audit | Backend implemented | Audit events exist; a dedicated superuser audit explorer remains |
| Notifications | Missing | No notification model, delivery service, or notification centre yet |
| Reporting/SLA | Missing | No SLA timers, loss-ratio reporting, heatmap, or escalation UI |
| Mobile/offline | Missing | API-first backend helps, but native clients and offline draft sync do not exist |

## Frontend file and page ownership

```text
src/
├── App.tsx                         authentication boundary
├── components/
│   ├── AuthHeader.tsx              sign-in brand treatment
│   ├── Workspace.tsx               role-aware navigation and app shell
│   └── ui.tsx                      shared headers, fields, tables and statuses
├── lib/
│   ├── data.ts                     Amplify data access
│   └── format.ts                   currency, date and label formatting
├── pages/
│   ├── OverviewPage.tsx            portfolio and operational summary
│   ├── AssetsPage.tsx              asset register and creation
│   ├── PoliciesPage.tsx            policy and cover visibility
│   ├── ClaimsPage.tsx              claim submission, filtering and detail
│   ├── DocumentsPage.tsx           scanned evidence locker
│   ├── ReviewPage.tsx              human decision gate
│   ├── EstimatorPage.tsx           deterministic premium preview
│   └── ProfilePage.tsx             identity, role and security posture
├── types.ts                        frontend domain contracts
└── styles.css                      responsive visual system
```

## Specification alignment

### Strong alignment

- Financial calculations use deterministic functions rather than LLM output.
- AI output is stored as analysis and remains advisory.
- Senior group authorization protects approve/reject mutations.
- Claim submission uses idempotency keys.
- Evidence is uploaded into a quarantine prefix, hashed, recorded, and scanned asynchronously.
- Claim processing is asynchronous and auditable.
- Owner-based and group-based authorization is defined per model.
- The frontend now makes the human decision boundary visible.

### Partial alignment

- The specification describes dynamic permissions; the implementation currently derives access primarily from Cognito groups.
- The document locker currently contains claim evidence, not reusable KYC documents.
- Claim history is presented as a derived UI timeline; a dedicated `claim_activities` model is not present.
- Policy management exists in the model but is read-only for clients and not yet a complete officer workflow.
- Profile data is minimal: display name, email, role, and status.
- Live updates exist for claim updates, but reconnect/backoff and broader event coverage are limited.

### Material gaps

- Notifications and scheduled reminders
- Claim comments, information requests, and client responses
- Asset inline edit, soft delete, document attachment, and bulk import
- Bulk policy renewal and dynamic excess persistence
- SLA tracking and escalation
- Audit log explorer and administrative user management
- POPIA export/anonymisation workflows
- Native iOS/Android apps, PKCE endpoints, biometric unlock, camera workflow, and offline queue
- CI coverage targets, end-to-end browser tests, performance budgets, and observability dashboards

## Recommended delivery order

1. Complete the claim state machine with information-request, payment, activity, and comment records.
2. Add policy administration plus asset edit/link/import workflows.
3. Add notification, SLA, and audit explorer modules.
4. Add data-export/anonymisation and security self-service features.
5. Add end-to-end tests and production telemetry before mobile client work.

## Verification baseline

The repository currently passes TypeScript type checking, ESLint, six automated backend tests, and a production Vite build. The generated frontend bundle is functional but large; route-level lazy loading should be introduced as the next performance improvement.
