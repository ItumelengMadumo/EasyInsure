// Fixture data for the demo. Dates are relative to "now" so the portfolio always looks current.
import { PERSONAS } from './mode';
import { estimatePremium } from './rules';

export type Db = Record<string, any[]>;
export const MODELS = [
  'UserProfile', 'Asset', 'Policy', 'PolicyApplication', 'PremiumAssessment', 'Claim', 'ClaimDocument',
  'ClaimAssignment', 'ClaimActivity', 'ClaimCommunication', 'ClaimInternalNote', 'ClaimAssessment',
] as const;

const DAY = 86_400_000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3_600_000).toISOString();
const dateOnly = (days: number) => ago(days).slice(0, 10);

const CLIENT = PERSONAS.client.userId;
const PIETER = 'demo-client-2';
const staffName = (role: keyof typeof PERSONAS) => PERSONAS[role].name;

export function seedDb(): Db {
  const db: Db = Object.fromEntries(MODELS.map((model) => [model, []]));
  const add = (model: (typeof MODELS)[number], record: Record<string, any>) => db[model].push(record);

  Object.values(PERSONAS).forEach((p) => add('UserProfile', { id: `prof-${p.userId}`, owner: p.userId, email: p.email, displayName: p.name, businessRole: p.role, status: 'active' }));
  add('UserProfile', { id: `prof-${PIETER}`, owner: PIETER, email: 'pieter.vandermerwe@demo.easyinsure.example', displayName: 'Pieter van der Merwe', businessRole: 'client', status: 'active' });

  const policy = (id: string, owner: string, no: string, premium: number, details: string) => add('Policy', {
    id, owner, policyNumber: no, valuationType: 'agreed_value', coverageDetails: details, durationMonths: 12,
    startDate: dateOnly(200), endDate: dateOnly(-165), status: 'ACTIVE', approvedPremium: premium, suggestedPremium: premium,
  });
  const asset = (a: Record<string, any>) => add('Asset', {
    condition: 'excellent', purchaseDate: dateOnly(700), registeredAt: ago(210), lastUpdatedAt: ago(30), portable: false, ...a,
    searchText: [a.description, a.make, a.model, a.vin, a.serialNumber].filter(Boolean).join(' '),
  });
  const application = (id: string, owner: string, no: string, assetId: string, assetType: string, status: string, value: number, extra: Record<string, any> = {}) => {
    const est = estimatePremium(assetType, value);
    add('PremiumAssessment', { id: `pa-${id}`, applicationId: id, ...est });
    add('PolicyApplication', {
      id, owner, applicationNumber: no, assetId, assetType, schemaVersion: 'demo-1', status, answers: {},
      completedSections: ['ownership', 'identity', 'specifications', 'condition', 'usage', 'security', 'valuation', 'risk'],
      missingInformation: [], latestAssessmentId: `pa-${id}`, submittedAt: ago(14), lastUpdatedAt: ago(2), ...extra,
    });
  };

  policy('pol-1', CLIENT, 'POL-100231', 1248, 'Comprehensive motor cover including theft, accident and weather damage.');
  policy('pol-2', CLIENT, 'POL-100232', 133, 'All-risk portable electronics cover.');
  policy('pol-3', PIETER, 'POL-100877', 702, 'Comprehensive motor cover.');
  asset({ id: 'ast-1', owner: CLIENT, assetType: 'vehicle', description: 'Toyota Hilux 2.8 GD-6 double cab', make: 'Toyota', model: 'Hilux', year: 2021, vin: 'AHTFB3CD600123456', registrationNumber: 'CA 482 913', mileageKm: 58000, purchasePrice: 520000, policyId: 'pol-1', status: 'INSURABLE' });
  asset({ id: 'ast-2', owner: CLIENT, assetType: 'electronics', description: 'MacBook Pro 14-inch', make: 'Apple', model: 'MacBook Pro', year: 2023, serialNumber: 'C02XK1ABC7', purchasePrice: 42000, policyId: 'pol-2', status: 'INSURABLE', portable: true });
  asset({ id: 'ast-3', owner: CLIENT, assetType: 'electronics', description: 'Canon EOS R6 camera kit', make: 'Canon', model: 'EOS R6', year: 2024, serialNumber: 'CN4401992', purchasePrice: 38000, status: 'UNDER_REVIEW', registeredAt: ago(9), portable: true });
  asset({ id: 'ast-4', owner: CLIENT, assetType: 'property', description: 'Family home, Waterkloof Pretoria', address: '14 Jacaranda Street, Waterkloof, Pretoria', squareFootage: 240, constructionType: 'Brick', roofType: 'Tile', purchasePrice: 1850000, status: 'UNDER_REVIEW', registeredAt: ago(3) });
  asset({ id: 'ast-5', owner: PIETER, assetType: 'vehicle', description: 'Volkswagen Polo Vivo 1.4', make: 'Volkswagen', model: 'Polo Vivo', year: 2019, vin: 'AAVZZZ6RZKU123789', registrationNumber: 'GP 330 221', mileageKm: 91000, purchasePrice: 215000, policyId: 'pol-3', status: 'INSURABLE' });
  application('app-1', CLIENT, 'APP-2026-0101', 'ast-1', 'vehicle', 'ACCEPTED', 520000, { quotedPremium: 1248 });
  application('app-2', CLIENT, 'APP-2026-0102', 'ast-2', 'electronics', 'ACCEPTED', 42000, { quotedPremium: 133 });
  application('app-3', CLIENT, 'APP-2026-0188', 'ast-3', 'electronics', 'QUOTED', 38000, { quotedPremium: 121, quoteExpiresAt: ago(-14) });
  application('app-4', CLIENT, 'APP-2026-0195', 'ast-4', 'property', 'SUBMITTED', 1850000, { submittedAt: ago(3) });
  application('app-5', PIETER, 'APP-2026-0140', 'ast-5', 'vehicle', 'ACCEPTED', 215000, { quotedPremium: 702 });

  type Claim = Record<string, any>;
  const claim = (c: Claim) => add('Claim', { tier: 2, riskScore: 24, fraudFlag: false, currentMilestone: c.status, lastActivityAt: ago(1), ...c });
  const staffAssign = (claimId: string, role: keyof typeof PERSONAS, assignmentRole: string, isLead: boolean) =>
    add('ClaimAssignment', { id: `asg-${claimId}-${role}`, claimId, userSubject: PERSONAS[role].userId, userDisplayNameSnapshot: staffName(role), userRoleSnapshot: PERSONAS[role].role, assignmentRole, isLead, active: true, assignedAt: ago(6) });
  let n = 0;
  const event = (claimId: string, milestone: string, summary: string, days: number, actor = 'EasyInsure', actorRole = 'system', detail?: string, visibility = 'CLIENT_VISIBLE') =>
    add('ClaimActivity', { id: `act-${++n}`, claimId, eventId: `evt-${n}`, eventType: milestone, milestone, actorDisplayNameSnapshot: actor, actorRoleSnapshot: actorRole, summary, detail, visibility, occurredAt: ago(days, n % 5) });
  const doc = (claimId: string, name: string, category: string, size: number, type = 'application/pdf') =>
    add('ClaimDocument', { id: `doc-${claimId}-${category}-${++n}`, claimId, fileName: name, mediaType: type, byteSize: size, status: 'CLEAN', category, visibility: 'CLIENT_VISIBLE' });
  const message = (claimId: string, from: string, role: string, direction: string, body: string, days: number) =>
    add('ClaimCommunication', { id: `msg-${++n}`, claimId, channel: 'PORTAL', direction, subject: 'Claim update', body, senderDisplayNameSnapshot: from, senderRoleSnapshot: role, deliveryState: 'DELIVERED', occurredAt: ago(days) });
  const note = (claimId: string, role: keyof typeof PERSONAS, body: string, days: number) =>
    add('ClaimInternalNote', { id: `note-${++n}`, claimId, authorDisplayNameSnapshot: staffName(role), authorRoleSnapshot: PERSONAS[role].role, body, occurredAt: ago(days) });

  // c1: waiting on a senior decision, the natural showcase for the review queue.
  claim({ id: 'clm-1', owner: CLIENT, claimNumber: 'CLM-20381', policeCaseNumber: 'CAS 214/09/2026', policyId: 'pol-1', assetId: 'ast-1', claimType: 'accidental_damage', description: 'Rear-ended at a traffic light on the N1; damage to the tailgate, bumper and canopy.', incidentDate: ago(12), amountRequested: 98000, status: 'DECISION_PENDING', suggestedPayout: 83200, submittedAt: ago(10) });
  staffAssign('clm-1', 'intermediate_officer', 'LEAD_ADVISOR', true); staffAssign('clm-1', 'senior_officer', 'SUPERVISOR', false);
  event('clm-1', 'SUBMITTED', 'Claim submitted', 10, 'Thandi Mokoena', 'client'); event('clm-1', 'VALIDATING', 'Evidence scanned and validated', 9);
  event('clm-1', 'UNDER_ASSESSMENT', 'Assessment started', 7, staffName('intermediate_officer'), 'intermediate_officer');
  event('clm-1', 'DECISION_PENDING', 'Assessment finalised for a payout decision', 2, staffName('senior_officer'), 'senior_officer', 'Recommended payout R 83 200 after depreciation and excess.');
  doc('clm-1', 'police-affidavit.pdf', 'AFFIDAVIT', 310_000); doc('clm-1', 'damage-photos.jpg', 'INCIDENT_EVIDENCE', 2_400_000, 'image/jpeg'); doc('clm-1', 'panelbeater-quote.pdf', 'REPAIR_ESTIMATE', 540_000);
  message('clm-1', staffName('intermediate_officer'), 'intermediate_officer', 'OUTBOUND', 'Thanks Thandi, the panel beater quote and photos are enough for us to assess the claim.', 6);
  note('clm-1', 'intermediate_officer', 'Quote is consistent with the photos. No signs of prior damage. Recommend standard depreciation of 10%.', 4);
  add('ClaimAssessment', { id: 'as-1', claimId: 'clm-1', version: 1, evidenceReviewed: ['doc-clm-1-AFFIDAVIT'], coveredLossValue: 98000, repairEstimate: 98000, policyLimit: 520000, excess: 5000, depreciation: 0.1, exclusions: [], recommendedPayout: 83200, status: 'FINAL' });

  // c2: needs a reply from the client.
  claim({ id: 'clm-2', owner: CLIENT, claimNumber: 'CLM-20402', policeCaseNumber: 'CAS 301/09/2026', policyId: 'pol-2', assetId: 'ast-2', claimType: 'theft', description: 'Laptop stolen from a locked car outside a restaurant.', incidentDate: ago(5), amountRequested: 42000, status: 'INFO_NEEDED', tier: 3, riskScore: 48, submittedAt: ago(4) });
  staffAssign('clm-2', 'junior_officer', 'LEAD_ADVISOR', true);
  event('clm-2', 'SUBMITTED', 'Claim submitted', 4, 'Thandi Mokoena', 'client'); event('clm-2', 'VALIDATING', 'Evidence scanned and validated', 3);
  event('clm-2', 'UNDER_ASSESSMENT', 'Information requested from the client', 1, staffName('junior_officer'), 'junior_officer', 'Please confirm the restaurant name and the time you parked.');
  doc('clm-2', 'police-affidavit.pdf', 'AFFIDAVIT', 280_000);
  message('clm-2', staffName('junior_officer'), 'junior_officer', 'OUTBOUND', 'Please confirm the restaurant name and the time you parked.', 1);

  // c3: fraud indicator on an in-progress assessment for the *other* client.
  claim({ id: 'clm-3', owner: PIETER, claimNumber: 'CLM-20415', policeCaseNumber: 'CAS 077/10/2026', policyId: 'pol-3', assetId: 'ast-5', claimType: 'theft', description: 'Vehicle stolen from the driveway overnight.', incidentDate: ago(8), amountRequested: 195000, status: 'UNDER_ASSESSMENT', tier: 4, riskScore: 71, fraudFlag: true, fraudReason: 'Claim lodged within 30 days of a cover increase.', submittedAt: ago(7) });
  staffAssign('clm-3', 'intermediate_officer', 'LEAD_ADVISOR', true);
  event('clm-3', 'SUBMITTED', 'Claim submitted', 7, 'Pieter van der Merwe', 'client'); event('clm-3', 'UNDER_ASSESSMENT', 'Assessment started', 5, staffName('intermediate_officer'), 'intermediate_officer');
  doc('clm-3', 'police-affidavit.pdf', 'AFFIDAVIT', 295_000); doc('clm-3', 'tracker-report.pdf', 'INCIDENT_EVIDENCE', 410_000);
  note('clm-3', 'intermediate_officer', 'Tracker last ping was 2km from the home address. Escalating the fraud flag to a senior for context.', 3);

  // c4: paid, ready for a senior to close.
  claim({ id: 'clm-4', owner: CLIENT, claimNumber: 'CLM-19804', policeCaseNumber: 'CAS 118/06/2026', policyId: 'pol-2', assetId: 'ast-2', claimType: 'accidental_damage', description: 'Screen cracked after a fall.', incidentDate: ago(60), amountRequested: 14000, status: 'PAID', riskScore: 12, tier: 1, suggestedPayout: 12300, approvedPayout: 12300, submittedAt: ago(58) });
  staffAssign('clm-4', 'junior_officer', 'LEAD_ADVISOR', true);
  ['SUBMITTED', 'VALIDATING', 'UNDER_ASSESSMENT', 'DECISION_PENDING', 'APPROVED', 'PAYMENT_PENDING', 'PAID'].forEach((m, i) => event('clm-4', m, `Claim ${m.toLowerCase().replace('_', ' ')}`, 58 - i * 4));
  doc('clm-4', 'police-affidavit.pdf', 'AFFIDAVIT', 250_000);

  // c5: freshly validated, so a junior officer can start the assessment themselves.
  claim({ id: 'clm-5', owner: PIETER, claimNumber: 'CLM-20431', policeCaseNumber: 'CAS 190/10/2026', policyId: 'pol-3', assetId: 'ast-5', claimType: 'weather', description: 'Hail damage to the bonnet and roof.', incidentDate: ago(3), amountRequested: 22000, status: 'VALIDATING', tier: 1, riskScore: 15, submittedAt: ago(2) });
  staffAssign('clm-5', 'junior_officer', 'LEAD_ADVISOR', true);
  event('clm-5', 'SUBMITTED', 'Claim submitted', 2, 'Pieter van der Merwe', 'client'); event('clm-5', 'VALIDATING', 'Evidence scanned and validated', 1);
  doc('clm-5', 'police-affidavit.pdf', 'AFFIDAVIT', 270_000); doc('clm-5', 'hail-damage.jpg', 'INCIDENT_EVIDENCE', 3_100_000, 'image/jpeg');

  return db;
}
