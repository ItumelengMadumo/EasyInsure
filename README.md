# EasyInsure

EasyInsure is a South African insurance platform for **underwriting assets, issuing cover and
handling claims**. Clients apply for cover asset by asset, accept a formal quote, and lodge claims
with a police report. Staff work those claims through a defined case lifecycle. A senior officer
makes every financial decision.

> **Core principle:** pricing and payout figures are deterministic formulas, AI output is advisory
> only, and no premium or payout is approved without a human. Every financial action is audited.

Built on **AWS Amplify Gen 2**: Cognito (auth), AppSync + DynamoDB (data), S3 + GuardDuty (evidence),
Lambda (business logic), Step Functions (claim assessment workflow) and Bedrock (AI summaries).

**Try it without an account:** open the landing page and choose **Try the demo**, or visit
`/?demo=<role>` (see [Demo mode](#demo-mode)).

---

## Table of contents

- [What the app does](#what-the-app-does)
- [Roles and permissions](#roles-and-permissions)
- [Core workflows](#core-workflows)
- [Demo mode](#demo-mode)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Backend reference](#backend-reference)
- [Frontend reference](#frontend-reference)
- [Environments and deployment](#environments-and-deployment)
- [Local development](#local-development)
- [Security](#security)
- [Further documentation](#further-documentation)

---

## What the app does

| Area | What users can do |
| --- | --- |
| **Landing page** (public) | Read how the product works and get an anonymous ballpark premium. No account or personal data needed. |
| **Overview** | Portfolio metrics (protected value, active policies, claims in progress, flagged claims), recent claims and cover coverage. |
| **Assets** | A 10-step policy application per asset (vehicle, property, electronics, furniture and valuables, machinery) with search, filters and sorting over the register. |
| **Policies** | Applications, indicative premium ranges, formal quotes and active policies. Seniors review and quote; clients accept. |
| **Claims** | Lodge a claim (police case number and affidavit required), then follow a case file: timeline, case team, documents, staff notes, payout assessment. |
| **Document locker** | Every evidence file with its scan status. |
| **Review queue** (staff) | Claims awaiting a payout decision. Only seniors can approve or reject. |
| **Profile & security** | Display name, role, and account closure (which anonymises identifiers but archives case records). |

---

## Roles and permissions

Roles are Cognito groups. Self-registration always creates a `client`; staff roles are assigned
manually in Cognito (`aws cognito-idp admin-add-user-to-group`).

| Role | What they can do |
| --- | --- |
| `client` | See only their own assets, applications, policies, claims and client-visible case activity. Apply for cover, accept quotes, lodge claims, answer information requests, message their advisor. |
| `junior_officer`, `intermediate_officer` | Work **only the claims they are actively assigned to**. Start assessment, request information from the client, message the client, add private notes, log calls, calculate payout assessments. They cannot decide claims. |
| `senior_officer` | Everything above across **all** cases, plus: assign the case team, review/decline applications and issue quotes, finalise payout assessments, approve or reject claims, record payouts and close cases. |
| `superuser` | Senior permissions, and the only role that can approve payouts above **R250,000**. |
| `developer` | Read-only diagnostics across every case. No case actions and no financial authority. |

Separation of duties is enforced server-side (`assertDecisionAuthority` in
`amplify/functions/claims-command/domain.ts`): a user cannot decide a claim they own, the assessor
and the officer who finalised an assessment cannot also decide the claim, and a payout cannot exceed
the policy limit.

Read access is enforced by AppSync authorization rules. All writes go through custom mutations
handled by the `claims-command` Lambda, which re-checks the caller's groups.

---

## Core workflows

### 1. Applying for cover

```text
DRAFT → SUBMITTED → UNDER_REVIEW (or MORE_INFO_REQUIRED) → QUOTED → ACCEPTED
                                                      └──→ DECLINED
```

1. The client starts an application, picks a category, and answers category-specific questions
   across ten steps. Each step is saved so the application can be resumed.
2. On submit, a purchase invoice or valuation is uploaded (it goes through evidence scanning) and a
   deterministic **indicative premium range** is calculated. This is not cover.
3. A senior officer begins review, then issues a **formal quote**. A quote more than 10% away from
   the indicative premium needs an override reason.
4. The client accepts the quote. Only then is an active **policy** created and linked to the asset.

### 2. Lodging and handling a claim

```text
DRAFT → ASSIGNMENT_PENDING → VALIDATING → UNDER_ASSESSMENT ⇄ INFO_NEEDED
      → DECISION_PENDING → APPROVED → PAYMENT_PENDING → PAID → CLOSED
                         └→ REJECTED → CLOSED
```

1. **Client** selects an insured asset, enters the SAPS case number, uploads the police affidavit,
   and describes the incident. A permanent `CLM-` claim number is created on submission.
2. **Assignment:** the least-loaded active officer becomes lead advisor. A scheduled worker (every
   5 minutes) retries unassigned claims, and unassigned claims past 15 minutes raise an SLA alarm.
3. **Assessment:** an officer starts assessment, which runs the Step Functions workflow
   (validate evidence → deterministic calculation → AI summary → persist analysis). The officer may
   ask the client for more information (`INFO_NEEDED`) and logs calls and private notes.
4. **Payout assessment:** staff enter evidence-supported covered loss, policy limit, excess and
   depreciation. The system recommends a payout bounded by those figures. A senior **finalises** it.
5. **Decision:** the finalised assessment appears in the Review queue. A senior approves (overriding
   the suggested amount requires a written reason) or rejects (the client sees the reason).
6. **Payment:** staff prepare payment and record the bank/EFT reference, then a senior closes the case.

Every step is added to a chronological timeline. Clients see only client-visible activity; internal
notes and diagnostics are staff-only.

---

## Demo mode

Prospective clients can explore every role without an account or a backend.

- **Entry:** the landing page's **Try the demo** buttons open a role picker. A direct link such as
  `/?demo=senior_officer` starts straight in that role.
- **In the demo:** a banner lets you switch role, reset the sample data or exit.
- **How it works:** it is frontend-only. `src/lib/demo/client.ts` is an in-memory replacement for the
  Amplify data client, seeded by `seed.ts` and kept in `sessionStorage`. `rules.ts` mirrors the
  backend's role visibility, plus simplified pricing and payout maths. Nothing touches AWS.
- **Fidelity:** the demo enforces who can see and do what, and lets visitors move a claim through
  the main lifecycle. Pricing and payout figures are simplified, and some production safeguards
  (separation of duties, the R250,000 limit, asynchronous assignment) are not modelled.
- **Switch it off:** set `VITE_DEMO_ENABLED=false` at build time.

---

## Architecture

```text
React / Vite SPA (src/)
   │  Amplify Auth (Cognito)  +  generateClient()          (demo mode swaps in an in-memory client)
   ▼
AppSync GraphQL API ── authorised by Cognito groups
   │
   ├── models (read)            DynamoDB
   ├── mutations / queries ───► claims-command (Lambda): every write, with permission checks
   │        └── startClaimProcessing ► Step Functions: validate → calculate → copilot → persist
   │                                    each stage run by process-claim (Lambda)
   │                                    ├── insurance-engine (Python Lambda, deterministic)
   │                                    └── claims-copilot (Lambda) ► Amazon Bedrock (PII redacted)
   └── getAssignedCasePortfolio ► officers' assigned-case view

S3 evidence bucket:  quarantine/ ──GuardDuty malware scan + scan-evidence──► evidence/
EventBridge (5 min) ─► assignment-worker      (assigns unassigned claims, emits SLA metric)
SQS (encrypted) ─────► communication-worker   (email/SMS/WhatsApp adapters, currently DISABLED)
HTTP API  POST /v1/inbound ─► communication-webhook (HMAC-signed inbound messages)
Cognito post-confirmation ─► post-confirmation    (adds new sign-ups to the client group)
```

Failures in the claims workflow go to a KMS-encrypted dead-letter queue. CloudWatch alarms watch
Lambda errors, DLQ depth, communication queue age/failures, webhook errors and assignment SLA breaches.

---

## Project structure

```text
EasyInsure/
├── amplify/                          Backend (infrastructure as code)
│   ├── backend.ts                    Wires resources: Step Functions, queues, alarms, GuardDuty, schedules
│   ├── auth/resource.ts              Cognito, role groups, post-confirmation trigger
│   ├── data/resource.ts              Models, enums, authorization and custom mutations/queries
│   ├── storage/resource.ts           S3 prefixes (quarantine / evidence / extracted) and access
│   ├── config/regions.ts             Single-region boundary (us-east-1)
│   ├── scripts/assert-regional-boundary.ts   CI guard (`npm run check:region`)
│   ├── backend.test.ts, security.test.ts     Backend and authorization tests
│   └── functions/
│       ├── claims-command/           All writes: applications, quotes, claims, assessments, decisions
│       ├── insurance-engine/         Python: tier, risk/premium, depreciation, fraud rules
│       ├── process-claim/            Step Functions stage handler
│       ├── claims-copilot/           Bedrock summaries + PII redaction (privacy.ts)
│       ├── scan-evidence/            Validates and promotes uploads after the malware scan
│       ├── assignment-worker/        Scheduled lead-advisor assignment
│       ├── communication-worker/     Queue consumer for outbound channels
│       ├── communication-webhook/    Signed inbound message/delivery webhook
│       └── post-confirmation/        Puts new users in the client group
├── src/                              Frontend (Vite + React 18 + TypeScript)
│   ├── App.tsx                       Landing → sign-in → workspace (or demo workspace)
│   ├── amplify.ts                    Configures Amplify; tolerates a missing amplify_outputs.json
│   ├── components/                   Workspace shell, DemoBanner, DemoPicker, shared UI
│   ├── pages/                        Landing, Overview, Assets, Policies, Claims, Documents, Review, Profile
│   ├── lib/                          data.ts (client + portfolio loading), identity.ts, format.ts
│   │   └── demo/                     Demo mode: mode, seed, rules, in-memory client, tests
│   └── styles.css
├── Docs/                             Design notes (see Further documentation)
├── amplify.yml                       Amplify Hosting build spec
└── package.json
```

---

## Backend reference

### Data model (`amplify/data/resource.ts`)

| Group | Models |
| --- | --- |
| People | `UserProfile`, `AccountClosureRequest` |
| Underwriting | `Asset`, `AssetDetail`, `UnderwritingProfile`, `PolicyApplication`, `PremiumAssessment`, `ApplicationDocument`, `AssetValuation`, `Policy` |
| Claims | `Claim`, `ClaimDocument`, `ClaimAssignment`, `ClaimActivity`, `ClaimInternalNote`, `ClaimAssessment`, `ClaimAnalysis`, `ProcessingJob` |
| Communication | `ClaimCommunication`, `CommunicationDelivery`, `CallRecord`, `InboundReconciliation` |
| Audit | `AuditEvent` |

Financial records keep a system value and a human value (for example `suggestedPayout` and
`approvedPayout`). Assignment and activity records store name and role **snapshots**, so history
stays accurate if a person's details change later.

### Pricing and rules

**Application premium** (`claims-command/underwriting.ts`, formula `premium-2026-01`): a base
monthly amount per category (vehicle R500, property R800, electronics R200, furniture R240,
machinery R700) multiplied by `1 + risk score`, with a floor of 50% of the base. Risk factors:
asset value (capped), declared prior losses (+0.12 each), condition, commercial use (+0.15) and prior
cancelled or declined cover (+0.20). The range shown is 85%–120% of the indicative premium. Every
factor carries a plain-language reason.

**Payout recommendation:** covered loss, reduced by depreciation, capped at the policy limit, less the
excess. A senior may override it, with a written reason.

**Insurance engine** (`insurance-engine/engines.py`, deterministic Python):
- **Tier:** claim amount up to R50,000 is Tier 1, up to R200,000 Tier 2, above that Tier 3.
- **Risk and premium:** weighted factors (young driver +40%, high-risk area +30%, asset over
  R200,000 +50%, three or more previous claims +35%, no previous claims −20%, under two years'
  experience +25%) applied to the base rate.
- **Depreciation:** `purchase price × (1 − annual rate) ^ years`, with annual rates of vehicle 15%,
  electronics 25%, property 2%, furniture 10% and machinery 12%, and a condition adjustment
  (excellent +10%, average 0%, poor −20%).
- **Fraud signals (rule-based):** several claims in a short period, claim above 80% of asset value,
  incident soon after policy start and very large amounts. Two or more high-severity signals
  recommend a high-risk flag for senior review.

### Evidence handling

Clients upload only PDF, JPEG or PNG files up to 10 MB. Files land in `quarantine/{identity}/…`,
where only the owner can read or write them. GuardDuty Malware Protection scans each upload and
`scan-evidence` re-checks size, type, checksum and file signature before promoting clean files to
`evidence/` (owner and staff read). Rejected files expire from quarantine. A claim's police affidavit
must be clean before assessment can start.

### Communication

The case timeline combines system activity with portal, email, SMS, WhatsApp and phone messages.
**Portal messaging is live.** Email, SMS and WhatsApp go through an encrypted queue to provider
adapters that currently return `DISABLED` until a provider is configured. Inbound messages arrive at
a signed webhook, are de-duplicated, matched by claim number, and sent to reconciliation if they
cannot be matched. See `Docs/CLAIM_CASE_ARCHITECTURE.md` before enabling a provider.

---

## Frontend reference

- **Navigation** is state-based (no router) and synced to `?page=`. One shared workspace adapts to
  the signed-in role; the Review queue is hidden from clients.
- **Data:** `src/lib/data.ts` exports `client` (the Amplify data client, or the demo client) and
  `loadPortfolio(groups)`, which loads what that role may see. Clients and seniors read models
  directly; junior/intermediate officers and developers use the `getAssignedCasePortfolio` query.
- **Identity:** `src/lib/identity.ts` returns the signed-in user's id, name, email and groups (or a
  demo persona).
- **Live updates:** the workspace subscribes to claim updates and refreshes.
- **Uploads:** `uploadQuarantined` validates type and size, hashes the file and uploads to quarantine.
- The frontend hides actions a role cannot use, but **permissions are enforced by the backend**.

---

## Environments and deployment

Amplify Hosting app **EasyInsure** (us-east-1) builds three branches with auto-build, each with its
own backend:

| Environment | Git branch | URL |
| --- | --- | --- |
| Development | `dev` | https://dev.d2cswbdinmshyt.amplifyapp.com |
| Staging | `Staging` | https://staging.d2cswbdinmshyt.amplifyapp.com |
| Production | `main` | https://main.d2cswbdinmshyt.amplifyapp.com |

Promote changes `dev` → `Staging` → `main`, confirming each build before the next. `amplify.yml` runs
`npm run check:region`, deploys the backend (`ampx pipeline-deploy`) and builds the frontend into
`dist/`. Deployment is blocked outside **us-east-1**.

Staff accounts are not self-service; add them to the correct Cognito group in each environment.
`Docs/AMPLIFY_MIGRATION.md` has the production rollout checklist.

---

## Local development

**Prerequisites:** Node.js 20–24 and, for a real backend, an AWS account with credentials configured.

```bash
npm install

# Option A: demo only, no AWS needed. Open the app and choose "Try the demo".
npm run dev                    # http://localhost:5173

# Option B: real backend in a personal sandbox (writes amplify_outputs.json)
npm run sandbox                # or: npm run sandbox:once
npm run dev                    # in a second terminal
npm run sandbox:delete         # tear the sandbox down to stop AWS costs
```

| Script | Purpose |
| --- | --- |
| `npm run check:region` | Guards the single-region boundary |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Vitest: backend, security and demo-mode tests |
| `npm run build` | Type-check and build the frontend into `dist/` |
| `npm run verify` | All of the above, in CI order |

---

## Security

- **Auth:** Cognito only; no custom password or JWT handling.
- **Authorization:** AppSync rules plus group checks inside `claims-command`; clients are read-only
  against the API and write through audited commands with idempotency keys.
- **Separation of duties** and payout limits are enforced server-side (see Roles and permissions).
- **PII** (names, emails, phone numbers, SA ID numbers) is redacted before anything reaches Bedrock,
  and Bedrock access is scoped to one approved inference profile.
- **Evidence** is quarantined, malware-scanned and re-validated server-side.
- **Audit:** `AuditEvent` records who did what, when, with before and after values.
- **Region:** deployments are restricted to us-east-1 locally and in the pipeline.
- **Account closure** anonymises direct identifiers but retains claims, decisions, audit events and
  communications under the retention policy (durations still need compliance approval).

---

## Further documentation

| File | Contents |
| --- | --- |
| `Docs/USER_FLOWS.md` | Intended user flows and flow rules |
| `Docs/ASSET_UNDERWRITING_ARCHITECTURE.md` | Applications, quotes and policy creation |
| `Docs/CLAIM_CASE_ARCHITECTURE.md` | Case identity, lifecycle, authorization, communication adapters |
| `Docs/AMPLIFY_MIGRATION.md` | Architecture notes and production rollout checklist |
| `Docs/PRODUCT_SITREP.md` | Product status review (dated July 2026; parts predate the current build) |

---

## License

Proprietary — EasyInsure Platform.
