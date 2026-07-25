# EasyInsure platform roadmap

This roadmap is the version-controlled source for GitHub tickets. Delivery order is Foundation,
P0, P1, then P2. Every row maps to one issue and one feature branch created from `dev`.

## Persona audit

| Persona | Primary outcome | Current strengths | Highest-priority gaps |
|---|---|---|---|
| Client | Obtain cover and resolve claims transparently | Detailed asset application, quote boundary, permanent claim timeline | Resumable applications, policy servicing, payments, notifications |
| Junior officer | Validate assigned claims and communicate safely | Assigned cases, document status, timeline, information requests | Daily task queue, checklists, SLAs, escalation |
| Intermediate advisor | Progress a portfolio through assessment | Team history, evidence assessment, client/internal communication | Prioritisation, case tasks, assessor/supplier workflow, workload |
| Senior officer | Control operational risk and financial decisions | Cross-case access, assignment, underwriting and payout approval | Command centre, authority limits, dual approval, reporting |
| Developer | Diagnose failures without business authority | Diagnostic role boundary, correlation IDs, alarms | Unified diagnostics, sanitized traces, audited retry/replay |
| Superuser | Govern people, configuration and compliance | Broad authorization and audit foundations | Administration, access review, retention/configuration controls |

## Foundation

| Ticket | Branch | Outcome |
|---|---|---|
| EI-0001 | `feature/EI-0001-github-ci-verification` | Required verification workflows, templates and governance |
| EI-0002 | `feature/EI-0002-branch-protection-and-codeowners` | Protected permanent branches and ownership |
| EI-0003 | `feature/EI-0003-amplify-dev-staging-environments` | Isolated Amplify dev and Staging deployments |
| EI-0004 | `feature/EI-0004-automatic-staging-promotion` | Passing dev automatically promotes by PR |
| EI-0005 | `feature/EI-0005-production-release-gate` | Approved Staging-to-main release and tagging |
| EI-0006 | `feature/EI-0006-persona-seed-data` | Deterministic non-production persona data |
| EI-0007 | `feature/EI-0007-end-to-end-persona-tests` | Authenticated six-persona acceptance suite |
| EI-0008 | `feature/EI-0008-release-version-and-environment-banner` | Visible version/environment and release traceability |

## P0 — Reliable current journeys

### Role workspaces

| Ticket | Branch |
|---|---|
| EI-0101 Client dashboard | `feature/EI-0101-client-dashboard` |
| EI-0102 Junior officer dashboard | `feature/EI-0102-junior-officer-dashboard` |
| EI-0103 Intermediate advisor dashboard | `feature/EI-0103-intermediate-advisor-dashboard` |
| EI-0104 Senior control centre | `feature/EI-0104-senior-control-centre` |
| EI-0105 Developer diagnostics dashboard | `feature/EI-0105-developer-diagnostics-dashboard` |
| EI-0106 Superuser administration dashboard | `feature/EI-0106-superuser-administration-dashboard` |
| EI-0107 Role-aware navigation/actions | `feature/EI-0107-role-aware-navigation-and-action-visibility` |
| EI-0108 Profile and identity consistency | `feature/EI-0108-profile-completion-and-identity-consistency` |

### Asset and policy applications

| Ticket | Branch |
|---|---|
| EI-0201 My policy applications | `feature/EI-0201-my-policy-applications` |
| EI-0202 Resume application | `feature/EI-0202-resume-asset-application` |
| EI-0203 Autosave and progress | `feature/EI-0203-application-autosave-and-progress` |
| EI-0204 Application document locker | `feature/EI-0204-application-document-locker` |
| EI-0205 Application withdrawal | `feature/EI-0205-application-withdrawal` |
| EI-0206 Underwriting assignment queue | `feature/EI-0206-underwriting-assignment-queue` |
| EI-0207 Structured underwriting review | `feature/EI-0207-structured-underwriting-review` |
| EI-0208 Formal quote document | `feature/EI-0208-formal-quote-document` |
| EI-0209 Quote expiry and acceptance | `feature/EI-0209-quote-expiry-and-acceptance` |
| EI-0210 Policy schedule generation | `feature/EI-0210-policy-schedule-generation` |

### Claim work management

| Ticket | Branch |
|---|---|
| EI-0301 Case-task domain | `feature/EI-0301-case-task-domain` |
| EI-0302 Advisor work queue | `feature/EI-0302-advisor-my-work-queue` |
| EI-0303 Claim SLA countdown | `feature/EI-0303-claim-sla-countdown` |
| EI-0304 Unread and follow-up indicators | `feature/EI-0304-unread-and-follow-up-indicators` |
| EI-0305 Validation checklist | `feature/EI-0305-claim-validation-checklist` |
| EI-0306 Structured escalation | `feature/EI-0306-structured-case-escalation` |
| EI-0307 Ready-for-decision checklist | `feature/EI-0307-ready-for-decision-checklist` |
| EI-0308 Advisor workload capacity | `feature/EI-0308-advisor-workload-capacity` |
| EI-0309 Bulk assignment and triage | `feature/EI-0309-bulk-assignment-and-triage` |
| EI-0310 Handoff and absence cover | `feature/EI-0310-case-handoff-and-absence-cover` |

### Senior operations

| Ticket | Branch |
|---|---|
| EI-0401 Unassigned queue | `feature/EI-0401-unassigned-claims-queue` |
| EI-0402 Overdue SLA queue | `feature/EI-0402-overdue-sla-queue` |
| EI-0403 Failed communication queue | `feature/EI-0403-failed-communication-queue` |
| EI-0404 Unmatched inbound queue | `feature/EI-0404-unmatched-inbound-queue` |
| EI-0405 Decision reason taxonomy | `feature/EI-0405-structured-decision-reasons` |
| EI-0406 Financial authority limits | `feature/EI-0406-financial-authority-limits` |
| EI-0407 High-value dual approval | `feature/EI-0407-high-value-dual-approval` |
| EI-0408 Performance and capacity | `feature/EI-0408-advisor-performance-and-capacity` |
| EI-0409 Audit explorer | `feature/EI-0409-audit-event-explorer` |

### Developer diagnostics

| Ticket | Branch |
|---|---|
| EI-0501 Correlation search | `feature/EI-0501-correlation-id-search` |
| EI-0502 Job inspector | `feature/EI-0502-processing-job-inspector` |
| EI-0503 Scan diagnostics | `feature/EI-0503-document-scan-diagnostics` |
| EI-0504 Delivery diagnostics | `feature/EI-0504-communication-delivery-diagnostics` |
| EI-0505 Webhook diagnostics | `feature/EI-0505-webhook-and-reconciliation-diagnostics` |
| EI-0506 Queue/alarm health | `feature/EI-0506-queue-and-alarm-health` |
| EI-0507 Sanitized errors | `feature/EI-0507-sanitized-error-inspection` |
| EI-0508 Audited job retry | `feature/EI-0508-audited-job-retry` |
| EI-0509 Audited message replay | `feature/EI-0509-audited-message-replay` |
| EI-0510 Frontend error reporting | `feature/EI-0510-frontend-error-reporting` |

### Authentication and access

| Ticket | Branch |
|---|---|
| EI-0601 MFA enrolment | `feature/EI-0601-mfa-enrolment` |
| EI-0602 Session recovery | `feature/EI-0602-session-expiry-recovery` |
| EI-0603 Suspended-account experience | `feature/EI-0603-suspended-account-experience` |
| EI-0604 Access-denied/invalid-role pages | `feature/EI-0604-access-denied-and-invalid-role-pages` |
| EI-0605 Multi-group conflict resolution | `feature/EI-0605-multi-group-conflict-resolution` |
| EI-0606 Staff invitation/roles | `feature/EI-0606-staff-invitation-and-role-assignment` |
| EI-0607 Role history/access review | `feature/EI-0607-role-history-and-access-review` |

## P1 — Complete insurance operations

### Policy servicing and billing

EI-1001 policy endorsements; EI-1002 renewal; EI-1003 cancellation; EI-1004 reinstatement;
EI-1005 cover-limit/excess changes; EI-1006 additional drivers/users; EI-1007 billing account;
EI-1008 debit-order mandate; EI-1009 payment status/arrears; EI-1010 refunds/failed payments;
EI-1011 cover-period claim validation.

Branch each as `feature/EI-<ticket>-<ticket-slug>` exactly as defined in the delivery plan.

### Claim service ecosystem

EI-1101 provider directory; EI-1102 assessor appointments; EI-1103 repairer/towing instructions;
EI-1104 supplier estimates/invoices; EI-1105 incident evidence; EI-1106 complaints; EI-1107
appeals; EI-1108 reopen claims; EI-1109 salvage/recovery; EI-1110 subrogation.

### Communication and documents

EI-1201 email; EI-1202 SMS; EI-1203 WhatsApp; EI-1204 notification preferences; EI-1205
templates; EI-1206 unread/assignment; EI-1207 inbound reconciliation; EI-1208 call consent and
recording; EI-1209 transcript review; EI-1210 unified locker; EI-1211 document version/expiry;
EI-1212 preview/download; EI-1213 legal hold.

### Search and productivity

EI-1301 global search; EI-1302 server pagination; EI-1303 saved views; EI-1304 recent items;
EI-1305 bulk actions; EI-1306 secure exports.

## P2 — Governance and scale

### Administration

EI-2001 staff lifecycle; EI-2002 organization hierarchy; EI-2003 delegation; EI-2004 SLA
administration; EI-2005 provider configuration; EI-2006 templates; EI-2007 retention policies;
EI-2008 feature flags; EI-2009 formula versions; EI-2010 configuration audit.

### Reporting and compliance

EI-2101 turnaround; EI-2102 SLA; EI-2103 payout variance; EI-2104 loss ratio; EI-2105 fraud;
EI-2106 conversion; EI-2107 POPIA consent; EI-2108 access export; EI-2109 correction; EI-2110
retention/deletion; EI-2111 compliance export.

### Reliability and accessibility

EI-2201 synthetic journeys; EI-2202 tracing; EI-2203 health checks; EI-2204 incidents/runbooks;
EI-2205 rollback visibility; EI-2206 GraphQL contracts; EI-2207 authorization matrix; EI-2208
code splitting; EI-2209 WCAG remediation; EI-2210 responsive workflow testing.

## Definition of done

A ticket must pass `npm run verify`, role-positive and role-negative authorization tests, compatible
migration and rollback review, loading/empty/error/access-denied UI states, and security/privacy
review. Mutations require idempotency, correlation IDs, and immutable audit output.
