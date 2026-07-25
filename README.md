# EasyInsure — AI-Assisted Insurance Claims Platform

An AI-assisted insurance platform that processes claims, detects fraud, calculates premiums, and
determines payouts using depreciation logic — with a **human-in-the-loop** approval workflow.

> **Core Principle:** LLMs assist decisions — they do NOT make final financial decisions. All
> premiums and payouts require human approval.

Built on **AWS Amplify Gen2**: Cognito for auth, AppSync/GraphQL + DynamoDB for data, S3 for
evidence storage, Lambda for business logic, Step Functions for claim processing, and Bedrock for
LLM-assisted analysis.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [System Philosophy](#system-philosophy)
- [Project Structure](#project-structure)
- [Backend](#backend)
  - [Data Model](#data-model)
  - [Auth & Roles](#auth--roles)
  - [Insurance Engine](#insurance-engine)
  - [Claims Workflow](#claims-workflow)
  - [Evidence Storage](#evidence-storage)
- [Frontend](#frontend)
- [Setup & Running](#setup--running)
- [Security Considerations](#security-considerations)

---

## Architecture Overview

```
React / Vite SPA (src/)
       │  Amplify Auth (Cognito) + generateClient()
       ▼
AppSync GraphQL API ──authorizes via── Cognito User Pool groups
       │
       ├── submitClaim / approveClaim / rejectClaim / assignOfficer / startClaimProcessing
       │        → claims-command (Lambda)
       │
       ├── runInsuranceEngine (assignTier / calculateRisk / calculateDepreciation / detectFraud)
       │        → insurance-engine (Python 3.12 Lambda, deterministic, no AWS/HTTP deps)
       │
       └── generateClaimCopilot
                → claims-copilot (Lambda) → Amazon Bedrock

startClaimProcessing kicks off a Step Functions workflow (validate → calculate → copilot →
persist), each stage run by the process-claim Lambda. On failure, a KMS-encrypted SQS dead-letter
queue captures the payload for replay.

Evidence files upload directly to S3 (quarantine/ prefix, Cognito-identity-scoped). An S3 onUpload
trigger (scan-evidence Lambda) validates and promotes them to evidence/ before a claim can proceed
past the validate stage.

DynamoDB (via AppSync) is the source of truth. Cognito PostConfirmation (post-confirmation Lambda)
assigns new self-registered users to the client group.
```

---

## System Philosophy

| Component               | Responsibility                                |
| ----------------------- | --------------------------------------------- |
| **LLM**                 | Extraction, summarization, anomaly hints      |
| **Insurance Engine**    | Premium, depreciation, and fraud calculation (deterministic) |
| **Claims Workflow**     | Orchestration & control (Step Functions)      |
| **DynamoDB**            | Source of truth                               |
| **Human (Officer)**     | Final premium & payout approval               |

### Key Design Principles

1. **LLM ≠ decision maker** — AI supports, humans decide
2. **Pricing is deterministic** — actuarial logic, no randomness
3. **Everything is explainable** — every risk factor has a reason
4. **Full audit trail** — `AuditEvent` records who did what, when
5. **Data sanitization** — PII is redacted before anything reaches Bedrock (`claims-copilot/privacy.ts`)
6. **Human-in-the-loop** — no financial transaction without human confirmation

---

## Project Structure

```
EasyInsure/
├── amplify/                       # Backend — everything here is infra-as-code (CDK via Amplify Gen2)
│   ├── backend.ts                 # Wires resources together: IAM grants, Step Functions, DLQ, alarms
│   ├── backend.test.ts            # Vitest tests for backend.ts / data model / PII redaction
│   ├── auth/resource.ts           # Cognito: groups, post-confirmation trigger
│   ├── data/resource.ts           # AppSync/DynamoDB schema: models, enums, mutations, authorization
│   ├── storage/resource.ts        # S3 bucket: quarantine/evidence/extracted access + onUpload trigger
│   ├── config/regions.ts          # Single-region deployment boundary (us-east-1)
│   ├── scripts/assert-regional-boundary.ts   # CI guard, run via `npm run check:region`
│   └── functions/
│       ├── insurance-engine/      # Python 3.12 — risk, depreciation, fraud, tier assignment
│       ├── claims-command/        # AppSync resolver: submit/approve/reject/assign/startProcessing
│       ├── claims-copilot/        # Bedrock-backed claim analysis + PII redaction
│       ├── process-claim/         # Step Functions stage handler (validate/calculate/copilot/persist)
│       ├── scan-evidence/         # S3 onUpload trigger: validates & promotes evidence documents
│       └── post-confirmation/     # Cognito trigger: assigns new users to the client group
├── src/                           # Frontend — Vite + React + TypeScript
│   ├── App.tsx                    # Authenticator-wrapped app shell (overview/assets/claims/review)
│   ├── amplify.ts                 # Amplify.configure(amplify_outputs.json)
│   └── styles.css
├── public/                        # Frontend static assets
├── index.html                     # Vite entry point
├── vite.config.ts
├── Docs/AMPLIFY_MIGRATION.md      # Architecture notes + production rollout checklist
└── package.json                   # Single project: frontend build + backend CDK share one toolchain
```

---

## Backend

### Data Model

Defined in `amplify/data/resource.ts` (AppSync/DynamoDB):

| Model            | Purpose                                                       |
| ---------------- | -------------------------------------------------------------- |
| `UserProfile`     | Profile info + business role, owner-editable                  |
| `Asset`           | Insured item (vehicle/property/electronics/etc.)               |
| `AssetValuation`  | Valuation history for an asset                                 |
| `Policy`          | Coverage terms, suggested/approved premium                     |
| `Claim`           | Full claim lifecycle: status, tier, risk score, fraud flag, suggested/approved payout |
| `ClaimDocument`   | Evidence file metadata + status (`QUARANTINED` → `CLEAN`/`REJECTED` → optionally `EXTRACTED`) |
| `ClaimAnalysis`   | Stored deterministic + LLM output per claim (versioned)        |
| `ClaimAssignment` | Historical lead/supporting case-team membership with identity snapshots |
| `ClaimActivity`   | Append-only client-safe progress and event history              |
| `ClaimCommunication` | Chronological portal/email/SMS/WhatsApp/phone case communication |
| `CommunicationDelivery` | Per-provider delivery state, retry and failure history   |
| `CallRecord`      | Call participants, consent, outcome and future transcript/audio keys |
| `AuditEvent`      | Immutable record of who did what, when, with before/after values |
| `ProcessingJob`   | Step Functions execution tracking (status, current step, retries) |

Claims carry both **suggested** and **approved** values — `suggestedPayout` is system-calculated,
`approvedPayout`/`approvedBy`/`approvalTimestamp` are only set by a human officer decision.
`Policy` follows the same pattern with `suggestedPremium`/`approvedPremium`.

### Auth & Roles

Cognito User Pool groups, enforced via AppSync `@auth` authorization rules on every model:

| Role                     | Access                                                        |
| ------------------------ | --------------------------------------------------------------- |
| `superuser`               | Full control                                                    |
| `senior_officer`          | Approve/reject claims, assign officers, manage policies         |
| `intermediate_officer`    | Read assigned claims/policies, request info, run the pipeline   |
| `junior_officer`          | Read-only on claims/policies                                    |
| `developer`               | Cross-case technical diagnostics; no financial approval rights  |
| `client`                  | Own assets/policies/claims only                                 |

Self-registration always lands new users in `client` — staff roles require manual promotion
(`aws cognito-idp admin-add-user-to-group`).

### Insurance Engine

`amplify/functions/insurance-engine/engines.py` — pure, dependency-free Python:

- **Tier assignment:** ≤ R50,000 → Tier 1, ≤ R200,000 → Tier 2, else Tier 3
- **Risk/premium:** `premium = base_rate × (1 + risk_score)`, with weighted factors (young driver
  +40%, high-risk area +30%, expensive asset (>R200k) +50%, poor claims history +35%, no prior
  claims −20%, inexperienced driver +25%). Base rates: vehicle R500, property R800, electronics
  R200, life R1000.
- **Depreciation/payout:** `value = purchase_price × (1 − annual_rate) ^ years_elapsed`, capped by
  market value, adjusted for condition (excellent +10%, average 0%, poor −20%), minus excess.
  Annual rates: vehicle 15%, electronics 25%, property 2%, furniture 10%, machinery 12%. Agreed-
  value policies pay the agreed amount instead of the depreciated value.
- **Fraud signals (rule-based):** 3+ claims in 12 months, claim > 80% of asset value, incident
  within 30 days of policy start, claim > R500,000 — two or more high-severity signals → `high`
  risk recommendation to flag for senior review.

### Claims Workflow

`startClaimProcessing` (staff-only) starts a Step Functions state machine
(`ClaimsWorkflow` in `amplify/backend.ts`) that invokes `process-claim` through four stages:

1. **validate** — confirms the claim is `PROCESSING` and every attached `ClaimDocument` is
   `CLEAN`/`EXTRACTED` (not still `QUARANTINED`)
2. **calculate** — calls `insurance-engine` for tier, risk, depreciation, and fraud
3. **copilot** — calls `claims-copilot` (Bedrock) for a structured summary/recommendation
4. **persist** — writes a `ClaimAnalysis`, moves the claim to `REVIEW`, logs an `AuditEvent`

Any stage failure routes to a KMS-encrypted SQS dead-letter queue via a `RecordWorkflowFailure`
step, and CloudWatch alarms watch both Lambda errors and DLQ depth.

### Evidence Storage

`amplify/storage/resource.ts` — one S3 bucket (`easyinsureEvidence`), versioned, three prefixes:

- `quarantine/{owner}/*` — client uploads land here first (owner read/write/delete only); expires
  after 7 days via lifecycle rule
- `evidence/{owner}/*` — promoted, validated documents (owner + staff read)
- `extracted/*` — reserved for future text-extraction output (staff read)

The `scan-evidence` Lambda fires on every upload, re-validates file size/type/checksum
server-side, and promotes passing files from `quarantine/` to `evidence/`, updating the matching
`ClaimDocument.status`. Files that fail validation are marked `REJECTED` and left to expire.

---

## Frontend

`src/App.tsx` wraps the app in Amplify UI's `<Authenticator>` (custom-branded header) and renders
a role-agnostic `Shell` with four views: **Overview** (portfolio metrics), **Assets** (register/
list insured items), **Claims** (submit with evidence upload, list), and **Review** (claims in
`REVIEW` status). Amplify config is loaded from `amplify_outputs.json` via `src/amplify.ts`.

---

## Delivery and roadmap

All changes follow `feature/EI-ticket → dev → Staging → main`. See
[`CONTRIBUTING.md`](CONTRIBUTING.md), [`Docs/DELIVERY_PIPELINE.md`](Docs/DELIVERY_PIPELINE.md), and
[`Docs/PLATFORM_ROADMAP.md`](Docs/PLATFORM_ROADMAP.md). Direct changes to permanent branches are
not part of the supported workflow.

## Setup & Running

### Prerequisites

- Node.js 20–24 (see `engines` in `package.json`)
- An AWS account with credentials configured locally (`aws configure` or equivalent)

### Backend + Frontend Setup

```bash
npm install

# Deploys Cognito/AppSync/DynamoDB/S3/Lambda/Step Functions to a personal sandbox stack and
# writes amplify_outputs.json with real config. Leave running for backend hot-reload, or use
# `npm run sandbox:once` for a single one-shot deploy.
npm run sandbox

# In a second terminal:
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

When you're done, tear down the sandbox stack with `npm run sandbox:delete` so it stops incurring
AWS costs.

### Other useful scripts

```bash
npm run check:region   # guards the single-region (us-east-1) deployment boundary
npm run typecheck      # tsc -b
npm run lint           # eslint .
npm test               # vitest run (amplify/backend.test.ts)
npm run verify         # check:region && lint && typecheck && test && build
```

See `Docs/AMPLIFY_MIGRATION.md` for the production rollout checklist (Amplify Hosting bootstrap,
staff group provisioning, monitoring, POPIA review, etc.).

---

## Security Considerations

The policy-application, asset-detail and evidence-based payout architecture is documented in
`Docs/ASSET_UNDERWRITING_ARCHITECTURE.md`.

- Authentication via Cognito (User Pool + Identity Pool); no custom JWT/password handling
- Authorization via AppSync `@auth` directives + Cognito group membership on every model —
  enforced server-side by AppSync, not by application code
- PII (names, emails, phone numbers, SA ID numbers) is redacted before any data reaches Bedrock
  (`amplify/functions/claims-copilot/privacy.ts`, covered by `amplify/backend.test.ts`)
- Bedrock access is IAM-scoped to a specific approved inference profile/model, not open
  `bedrock:InvokeModel *`
- Evidence uploads are quarantined and server-side re-validated (size/type/checksum) before being
  trusted, independent of client-side checks
- Deployment is restricted to a single region (`amplify/config/regions.ts`,
  `amplify/scripts/assert-regional-boundary.ts`) enforced both locally and in the pipeline

---

## License

Proprietary — EasyInsure Platform.
