import type { BusinessRole, Page, Portfolio } from '../types';

export type PersonaDefinition = {
  role: BusinessRole;
  label: string;
  name: string;
  purpose: string;
  navigation: Page[];
  permitted: string[];
  forbidden: string[];
  checklist: Array<{ task: string; expected: string }>;
  testEmail: string;
};

const baseNavigation: Page[] = ['overview', 'assets', 'policies', 'claims', 'documents', 'profile'];
const staffNavigation: Page[] = [...baseNavigation.slice(0, 5), 'review', 'profile'];

export const personas: PersonaDefinition[] = [
  {
    role: 'client', label: 'Client', name: 'Thandi Mokoena', purpose: 'Protect assets, manage cover and follow claims.',
    navigation: baseNavigation, testEmail: 'persona.client@dev.easyinsure.invalid',
    permitted: ['Register an asset', 'Resume an application', 'Accept a quote', 'Submit and follow a claim', 'Send client-visible messages'],
    forbidden: ['View internal notes', 'Assign advisors', 'Approve payouts'],
    checklist: [
      { task: 'Inspect the unfinished vehicle application', expected: 'Progress and missing information are clear.' },
      { task: 'Open the active policy and quote', expected: 'Indicative pricing is distinct from active cover.' },
      { task: 'Follow the closed claim timeline', expected: 'Police and EasyInsure references and client-visible events remain available.' },
    ],
  },
  {
    role: 'junior_officer', label: 'Junior officer', name: 'Lerato Dlamini', purpose: 'Validate assigned cases and obtain missing evidence.',
    navigation: staffNavigation, testEmail: 'persona.junior@dev.easyinsure.invalid',
    permitted: ['Inspect assigned work', 'Validate documents', 'Request information', 'Escalate a case'],
    forbidden: ['Start insurer assessment', 'Approve or reject payouts', 'Access unassigned client cases'],
    checklist: [
      { task: 'Open the affidavit validation case', expected: 'Evidence state and next action are visible.' },
      { task: 'Review the information-needed case', expected: 'The client request appears chronologically.' },
      { task: 'Inspect Review queue', expected: 'Decision controls remain unavailable.' },
    ],
  },
  {
    role: 'intermediate_officer', label: 'Intermediate advisor', name: 'Kabelo Nkosi', purpose: 'Assess evidence and prepare claim recommendations.',
    navigation: staffNavigation, testEmail: 'persona.advisor@dev.easyinsure.invalid',
    permitted: ['Assess assigned claims', 'Record calls', 'Add internal notes', 'Prepare payout recommendations'],
    forbidden: ['Finalize payout decisions', 'Access unrelated claims', 'Administer staff access'],
    checklist: [
      { task: 'Open the under-assessment claim', expected: 'Evidence, communications and assignment history share one case view.' },
      { task: 'Inspect the assessment recommendation', expected: 'Policy limit, excess and depreciation are explainable.' },
      { task: 'Inspect Review queue', expected: 'Senior decision controls remain unavailable.' },
    ],
  },
  {
    role: 'senior_officer', label: 'Senior officer', name: 'Naledi Molefe', purpose: 'Oversee operations, assignments and human financial decisions.',
    navigation: staffNavigation, testEmail: 'persona.senior@dev.easyinsure.invalid',
    permitted: ['View all cases', 'Assign case teams', 'Review underwriting', 'Approve or reject payouts', 'Inspect internal records'],
    forbidden: ['Bypass audit reasons', 'Expose internal notes to clients'],
    checklist: [
      { task: 'Find the unassigned claim', expected: 'Assignment status and SLA risk are obvious.' },
      { task: 'Review the decision-pending claim', expected: 'Evidence-based recommendation and human decision controls are visible.' },
      { task: 'Inspect failed communication', expected: 'Delivery failure remains separate from the original message.' },
    ],
  },
  {
    role: 'developer', label: 'Developer', name: 'Devon Jacobs', purpose: 'Diagnose platform failures without receiving business authority.',
    navigation: staffNavigation, testEmail: 'persona.developer@dev.easyinsure.invalid',
    permitted: ['Inspect sanitized operational data', 'Trace correlation IDs', 'Review mock delivery and scan states'],
    forbidden: ['Approve payouts', 'Issue policies', 'Communicate as an advisor'],
    checklist: [
      { task: 'Inspect the failed mock delivery', expected: 'Failure state is visible without client secrets.' },
      { task: 'Open Review queue', expected: 'Financial decision controls remain disabled.' },
      { task: 'Check identity diagnostics', expected: 'Resolved profile and Cognito group agree.' },
    ],
  },
  {
    role: 'superuser', label: 'Superuser', name: 'Amina Patel', purpose: 'Oversee the complete platform and access boundaries.',
    navigation: staffNavigation, testEmail: 'persona.superuser@dev.easyinsure.invalid',
    permitted: ['View all portfolios', 'Perform senior operations', 'Inspect role consistency', 'Access Persona Lab'],
    forbidden: ['Suppress audit history', 'Use preview mode to change live data'],
    checklist: [
      { task: 'Compare every persona navigation', expected: 'Only role-appropriate destinations appear.' },
      { task: 'Inspect all claims', expected: 'Assignment, milestone and exception states are distinguishable.' },
      { task: 'Return to Persona Lab', expected: 'The live superuser identity remains unchanged.' },
    ],
  },
];

export const personaByRole = (role: BusinessRole) => personas.find((persona) => persona.role === role)!;

const now = '2026-07-27T08:30:00.000Z';
const asset = (id: string, type: string, description: string, price: number, policyId?: string) => ({
  id, assetType: type, description, purchasePrice: price, purchaseDate: '2024-03-12', condition: 'GOOD',
  make: type === 'VEHICLE' ? 'Toyota' : undefined, model: type === 'VEHICLE' ? 'Corolla Cross' : undefined,
  year: 2024, registrationNumber: type === 'VEHICLE' ? 'GP 42 EI GP' : undefined, policyId, status: policyId ? 'INSURABLE' : 'UNDER_REVIEW',
  registeredAt: '2026-06-01T10:00:00.000Z', lastUpdatedAt: now,
});

const claims = [
  { id: 'claim-unassigned', owner: 'persona-client', claimNumber: 'EIC-2026-000121', policeCaseNumber: 'CAS-104/07/2026', policyId: 'policy-home', assetId: 'asset-home', claimType: 'THEFT', description: 'Gate motor and outdoor equipment stolen.', incidentDate: '2026-07-23', status: 'ASSIGNMENT_PENDING', currentMilestone: 'ASSIGNMENT_PENDING', submittedAt: '2026-07-24T07:00:00.000Z', lastActivityAt: now },
  { id: 'claim-validation', owner: 'persona-client', claimNumber: 'EIC-2026-000122', policeCaseNumber: 'CAS-118/07/2026', policyId: 'policy-car', assetId: 'asset-car', claimType: 'ACCIDENT', description: 'Rear collision while stationary.', incidentDate: '2026-07-20', status: 'VALIDATING', currentMilestone: 'VALIDATING', submittedAt: '2026-07-21T08:00:00.000Z', lastActivityAt: now },
  { id: 'claim-assessment', owner: 'persona-client', claimNumber: 'EIC-2026-000123', policeCaseNumber: 'CAS-091/07/2026', policyId: 'policy-car', assetId: 'asset-car', claimType: 'ACCIDENT', description: 'Front bumper and headlamp damage.', incidentDate: '2026-07-16', status: 'UNDER_ASSESSMENT', currentMilestone: 'UNDER_ASSESSMENT', suggestedPayout: 28750, submittedAt: '2026-07-17T08:00:00.000Z', lastActivityAt: now },
  { id: 'claim-decision', owner: 'persona-client', claimNumber: 'EIC-2026-000124', policeCaseNumber: 'CAS-071/07/2026', policyId: 'policy-home', assetId: 'asset-home', claimType: 'DAMAGE', description: 'Storm damage to roof and ceiling.', incidentDate: '2026-07-09', status: 'DECISION_PENDING', currentMilestone: 'DECISION_PENDING', suggestedPayout: 64200, submittedAt: '2026-07-10T08:00:00.000Z', lastActivityAt: now },
  { id: 'claim-closed', owner: 'persona-client', claimNumber: 'EIC-2026-000099', policeCaseNumber: 'CAS-012/05/2026', policyId: 'policy-car', assetId: 'asset-car', claimType: 'GLASS', description: 'Windscreen damaged by road debris.', incidentDate: '2026-05-02', status: 'CLOSED', currentMilestone: 'CLOSED', suggestedPayout: 7200, approvedPayout: 6700, submittedAt: '2026-05-03T08:00:00.000Z', closedAt: '2026-05-12T15:00:00.000Z', lastActivityAt: '2026-05-12T15:00:00.000Z' },
];

export function createPersonaPortfolio(role: BusinessRole): Portfolio {
  const persona = personaByRole(role);
  const isClient = role === 'client';
  const visibleClaims = isClient || ['senior_officer', 'developer', 'superuser'].includes(role)
    ? claims : role === 'junior_officer' ? claims.slice(1, 2) : claims.slice(2, 4);
  const profiles = personas.map((item) => ({ id: `profile-${item.role}`, owner: `persona-${item.role}`, email: item.testEmail, displayName: item.name, businessRole: item.role, status: 'ACTIVE' }));
  return {
    assets: [asset('asset-car', 'VEHICLE', '2024 Toyota Corolla Cross XR', 482000, 'policy-car'), asset('asset-home', 'PROPERTY', 'Primary residence, Midrand', 2150000, 'policy-home'), asset('asset-laptop', 'ELECTRONICS', 'Workstation laptop', 46000)],
    policies: [
      { id: 'policy-car', policyNumber: 'EIP-MTR-10291', valuationType: 'RETAIL', coverageDetails: 'Comprehensive motor cover', durationMonths: 12, startDate: '2026-01-01', endDate: '2026-12-31', status: 'ACTIVE', approvedPremium: 1840 },
      { id: 'policy-home', policyNumber: 'EIP-HOM-09114', valuationType: 'REPLACEMENT', coverageDetails: 'Buildings and contents', durationMonths: 12, startDate: '2026-02-01', endDate: '2027-01-31', status: 'ACTIVE', approvedPremium: 2290 },
    ],
    applications: [
      { id: 'app-draft', owner: 'persona-client', applicationNumber: 'EIA-2026-0041', assetId: 'asset-laptop', assetType: 'ELECTRONICS', schemaVersion: '1', status: 'DRAFT', answers: { ownership: 'OWNED' }, completedSections: ['category', 'ownership'], missingInformation: ['Serial number', 'Proof of purchase', 'Security details'], lastUpdatedAt: now },
      { id: 'app-info', owner: 'persona-client', applicationNumber: 'EIA-2026-0038', assetType: 'VEHICLE', schemaVersion: '1', status: 'MORE_INFO_REQUIRED', answers: { usage: 'PERSONAL' }, completedSections: ['category', 'ownership', 'identification'], missingInformation: ['Updated tracking certificate'], latestAssessmentId: 'premium-1', quotedPremium: 1975, quoteExpiresAt: '2026-08-15', submittedAt: '2026-07-18T09:00:00.000Z', lastUpdatedAt: now },
    ],
    premiumAssessments: [{ id: 'premium-1', applicationId: 'app-info', indicativePremium: 1920, rangeLow: 1750, rangeHigh: 2120, riskScore: 43, factors: [{ name: 'Vehicle security', factor: 0.92, reason: 'Factory immobiliser and secure overnight parking.' }, { name: 'Claims history', factor: 1.08, reason: 'One prior glass claim.' }], assumptions: ['Personal use', 'Primary driver declared'] }],
    claims: visibleClaims,
    documents: visibleClaims.map((claim, index) => ({ id: `doc-${claim.id}`, claimId: claim.id, fileName: index === 0 ? 'affidavit.pdf' : 'assessment-evidence.pdf', mediaType: 'application/pdf', byteSize: 184000, status: index === 0 ? 'AWAITING_SCAN' : 'CLEAN', category: 'AFFIDAVIT', visibility: 'CLIENT_VISIBLE' })),
    assignments: visibleClaims.filter((claim) => claim.id !== 'claim-unassigned').map((claim) => ({ id: `assignment-${claim.id}`, claimId: claim.id, userSubject: role === 'junior_officer' ? 'persona-junior' : 'persona-advisor', userDisplayNameSnapshot: role === 'junior_officer' ? 'Lerato Dlamini' : 'Kabelo Nkosi', userRoleSnapshot: role, assignmentRole: 'LEAD', isLead: true, active: true, assignedAt: '2026-07-22T08:00:00.000Z' })),
    activities: visibleClaims.flatMap((claim) => [
      { id: `activity-submit-${claim.id}`, claimId: claim.id, eventId: `evt-submit-${claim.id}`, eventType: 'CLAIM_SUBMITTED', milestone: 'SUBMITTED', actorDisplayNameSnapshot: 'Thandi Mokoena', actorRoleSnapshot: 'client', summary: 'Claim submitted with police reference and affidavit.', visibility: 'CLIENT_VISIBLE', occurredAt: claim.submittedAt ?? now },
      { id: `activity-current-${claim.id}`, claimId: claim.id, eventId: `evt-current-${claim.id}`, eventType: 'MILESTONE_CHANGED', milestone: claim.currentMilestone ?? claim.status, actorDisplayNameSnapshot: 'EasyInsure Operations', actorRoleSnapshot: 'system', summary: `Case moved to ${String(claim.currentMilestone ?? claim.status).toLowerCase().replaceAll('_', ' ')}.`, visibility: 'CLIENT_VISIBLE', occurredAt: claim.lastActivityAt ?? now },
    ]),
    communications: visibleClaims.map((claim) => ({ id: `communication-${claim.id}`, claimId: claim.id, channel: claim.id === 'claim-decision' ? 'EMAIL' : 'PORTAL', direction: 'OUTBOUND', subject: 'Case update', body: 'We have received your evidence and will keep you informed.', senderDisplayNameSnapshot: 'EasyInsure Claims Team', senderRoleSnapshot: 'intermediate_officer', deliveryState: claim.id === 'claim-decision' ? 'FAILED' : 'DELIVERED', occurredAt: now })),
    internalNotes: isClient ? [] : visibleClaims.map((claim) => ({ id: `note-${claim.id}`, claimId: claim.id, authorDisplayNameSnapshot: 'Kabelo Nkosi', authorRoleSnapshot: 'intermediate_officer', body: 'Confirm repair estimate against policy schedule before recommendation.', occurredAt: now })),
    claimAssessments: ['senior_officer', 'intermediate_officer', 'developer', 'superuser'].includes(role) ? [{ id: 'assessment-claim-decision', claimId: 'claim-decision', version: 1, evidenceReviewed: ['Roof inspection', 'Contractor estimate'], coveredLossValue: 70000, repairEstimate: 70000, policyLimit: 1500000, excess: 3500, depreciation: 2300, exclusions: [], recommendedPayout: 64200, status: 'PENDING_APPROVAL' }] : [],
    profiles, profile: profiles.find((profile) => profile.businessRole === persona.role) ?? null,
  };
}

export function resolveRole(groups: string[], profileRole?: string | null) {
  const valid = new Set(personas.map((persona) => persona.role));
  const groupRoles = groups.filter((group): group is BusinessRole => valid.has(group as BusinessRole));
  if (groupRoles.length !== 1) return { role: null, conflict: groupRoles.length ? 'Multiple Cognito business roles are assigned.' : 'No Cognito business role is assigned.' };
  if (profileRole && profileRole !== groupRoles[0]) return { role: null, conflict: `Profile role (${profileRole}) does not match Cognito role (${groupRoles[0]}).` };
  return { role: groupRoles[0], conflict: '' };
}

export const personaLabEnabled = () => {
  const environment = (import.meta as unknown as { env?: { DEV?: boolean; VITE_APP_ENV?: string } }).env;
  return Boolean(environment?.DEV) || String(environment?.VITE_APP_ENV ?? '').toLowerCase() === 'dev';
};
