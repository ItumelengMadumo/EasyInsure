# EasyInsure User Flows

These flows are the product contract for the current build. They separate public exploration from authenticated insurance management and keep every financial decision understandable.

## Experience boundary

```text
Public visitor
  ├─ Understand the product
  ├─ Explore an anonymous ballpark premium
  └─ Log in / create account
             ↓
Authenticated member workspace
  ├─ Register and maintain assets
  ├─ Understand policies and cover
  ├─ Submit and track claims
  ├─ Manage evidence
  └─ Manage identity and security

Authorized officer workspace
  └─ Review calculations and evidence → approve or reject
```

The public estimator intentionally uses no personal information. It gives an indicative result rather than creating a policy or implying that underwriting has occurred.

## Flow 1: Public discovery to account

1. Visitor lands on a clear value proposition.
2. Visitor can understand assets, cover, claims, and the human-control principle without signing in.
3. Visitor optionally calculates an anonymous ballpark premium.
4. Visitor chooses `Create account` or `Log in`.
5. Authentication happens in a dedicated, trust-oriented screen.
6. Successful authentication opens the management workspace.

Success criteria:

- No authentication is required to understand the product or use the estimator.
- Estimate language consistently says “indicative,” “ballpark,” and “not a quote.”
- The transition to authentication preserves a visible way back home.
- Signing out returns the person to the public landing page.

## Flow 2: Register an asset

1. Member opens Assets and selects `Register asset`.
2. Member chooses a category.
3. The platform requests category-specific identification information.
4. The member provides value, purchase date, condition, use, and purchase source.
5. The platform confirms registration and makes the asset available for cover linking.

Category-specific inputs:

- Vehicle: make, model, year, registration, VIN, and mileage.
- Property: address, floor area, construction, roof, occupancy, and security.
- Electronics: brand, model, serial, year, portability, and storage/security.
- Furniture: brand/range, serial where applicable, year, and security/storage.
- Machinery: manufacturer, model, serial, year, portability, and storage/security.

Future extension:

- After validation, call the deterministic pricing engine with asset data and client risk inputs.
- Display an explainable per-asset premium breakdown.
- Require explicit user confirmation before creating a quote or requesting cover.

## Flow 3: Claim submission

1. Member selects an asset already linked to an active policy.
2. Member supplies the mandatory police case number and affidavit.
3. Member records incident type, date, location, description, requested amount, and optional supporting evidence.
4. The platform creates a resumable draft and quarantines its documents.
5. Final submission creates one permanent EasyInsure claim number using idempotent commands.
6. The platform assigns a lead advisor after receipt or exposes assignment as pending.
7. Evidence scanning, deterministic checks, AI-assisted summarisation, and human review create chronological case activities.
8. Portal and external-channel communication remains attached to the permanent case.

## Flow 4: Human claim decision

1. Officer opens the review queue.
2. Officer sees requested amount, suggested payout, risk, tier, and rule indicators.
3. The platform identifies AI content as advisory.
4. A senior officer approves or rejects.
5. The action and changed values are written to the audit trail.

## Flow rules for future work

- Give each screen one primary user objective.
- Ask only for information needed at that stage.
- Reveal specialist fields based on previous answers.
- Preserve drafts before long or interruptible tasks.
- Never use AI language for a deterministic calculation.
- Never present a financial recommendation as a final decision.
- Explain why a field is required when the reason is not obvious.
- Prevent duplicate submissions and show clear recovery states.
- Test every flow for client, junior, intermediate, senior, developer, and superuser permissions. Developers receive cross-case diagnostics but cannot perform case decisions or financial approvals.
- Validate responsive behavior at mobile, tablet, laptop, and large desktop widths.
