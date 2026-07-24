# Asset underwriting and policy applications

Asset registration is an application for cover, not proof of cover:

`DRAFT → SUBMITTED → MORE_INFO_REQUIRED/UNDER_REVIEW → QUOTED → ACCEPTED`

Acceptance creates and links an active policy. A decline marks the asset and application declined while retaining their audit history.

## Records

- `Asset` contains stable, searchable identity and portfolio fields.
- `AssetDetail` preserves category-specific answers with their schema version.
- `UnderwritingProfile` stores consented declaration snapshots.
- `PolicyApplication` tracks progress, missing information, quote and acceptance.
- `PremiumAssessment` stores versioned inputs, explainable factors, range and formula version.
- `ApplicationDocument` sends invoices and valuations through quarantine and scanning.

The first definitions cover vehicles, property, electronics, furniture/valuables and machinery. Definitions are server-controlled and versioned so historical applications remain interpretable.

## Decision boundaries

Indicative premiums are deterministic estimates, never active cover. Human underwriting issues a formal quote and the client explicitly accepts it.

Clients do not request claim payouts. `amountRequested` remains nullable only for legacy migration. Assigned staff create append-only assessments from clean evidence; recommendations are bounded by evidenced loss, estimates, policy limits, depreciation and excess. A senior finalizes the assessment and explains overrides.
