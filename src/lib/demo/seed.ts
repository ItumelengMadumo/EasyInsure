// Fixture data for the demo. Dates are relative to "now" so the portfolio always looks current, and
// every claim follows one coherent sequence: incident, then submission, then the events after it.
import { PERSONAS } from './mode';
import { POLICY_WORDING_VERSION, estimatePremium } from './rules';

const price = (assetType: string, value: number) => estimatePremium(assetType, { purchasePrice: value, condition: 'average', assetUse: 'Personal', priorClaims: 0 });

export type Db = Record<string, any[]>;
export const MODELS = [
  'UserProfile', 'Asset', 'Policy', 'PolicyApplication', 'PremiumAssessment', 'Claim', 'ClaimDocument',
  'ClaimAssignment', 'ClaimActivity', 'ClaimCommunication', 'ClaimInternalNote', 'ClaimAssessment', 'ClaimAnalysis', 'ProcessingJob',
] as const;

const DAY = 86_400_000;
/** A moment `days` ago at the given hour of the day. */
const at = (days: number, hour = 10) => { const d = new Date(Date.now() - days * DAY); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const dateOnly = (days: number) => at(days).slice(0, 10);

const CLIENT = PERSONAS.client.userId;
const PIETER = 'demo-client-2';
const SENIOR_2 = 'demo-senior-2';
const staffName = (role: keyof typeof PERSONAS) => PERSONAS[role].name;
const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

export function seedDb(): Db {
  const db: Db = Object.fromEntries(MODELS.map((model) => [model, []]));
  const add = (model: (typeof MODELS)[number], record: Record<string, any>) => db[model].push(record);

  Object.values(PERSONAS).forEach((p) => add('UserProfile', { id: `prof-${p.userId}`, owner: p.userId, email: p.email, displayName: p.name, businessRole: p.role, status: 'active' }));
  add('UserProfile', { id: `prof-${PIETER}`, owner: PIETER, email: 'pieter.vandermerwe@demo.easyinsure.example', displayName: 'Pieter van der Merwe', businessRole: 'client', status: 'active' });
  add('UserProfile', { id: `prof-${SENIOR_2}`, owner: SENIOR_2, email: 'thabo.molefe@demo.easyinsure.example', displayName: 'Thabo Molefe', businessRole: 'senior_officer', status: 'active' });

  const policy = (id: string, owner: string, no: string, premium: number, details: string, coverLimit: number, excess: number, exclusions: string[]) => add('Policy', {
    id, owner, policyNumber: no, valuationType: 'agreed_value', coverageDetails: details, durationMonths: 12,
    startDate: at(200), endDate: at(-165), status: 'ACTIVE', approvedPremium: premium, suggestedPremium: premium,
    coverLimit, excess, exclusions, wordingVersion: POLICY_WORDING_VERSION,
  });
  const asset = (a: Record<string, any>) => add('Asset', {
    condition: 'excellent', purchaseDate: dateOnly(700), registeredAt: at(210), lastUpdatedAt: at(30), portable: false, ...a,
    searchText: [a.description, a.make, a.model, a.vin, a.serialNumber].filter(Boolean).join(' '),
  });
  const application = (id: string, owner: string, no: string, assetId: string, assetType: string, status: string, value: number, terms: { excess: number; coverLimit: number; exclusions: string[] }, extra: Record<string, any> = {}) => {
    const est = price(assetType, value);
    add('PremiumAssessment', { id: `pa-${id}`, applicationId: id, ...est });
    add('PolicyApplication', {
      id, owner, applicationNumber: no, assetId, assetType, schemaVersion: 'demo-1', status, answers: {},
      completedSections: ['ownership', 'identity', 'specifications', 'condition', 'usage', 'security', 'valuation', 'risk'],
      missingInformation: [], latestAssessmentId: `pa-${id}`, submittedAt: at(14), lastUpdatedAt: at(2),
      ...(['QUOTED', 'ACCEPTED'].includes(status) ? { quotedPremium: est.indicativePremium, quoteTerms: { ...terms, wordingVersion: POLICY_WORDING_VERSION } } : {}), ...extra,
    });
  };

  const motorExclusions = ['Wear and tear', 'Driving under the influence', 'Unlicensed drivers', 'Racing or competition use'];
  const deviceExclusions = ['Wear and tear', 'Unattended in a vehicle without a lockable boot', 'Cosmetic damage that does not affect use'];
  policy('pol-1', CLIENT, 'POL-100231', price('vehicle', 520000).indicativePremium, 'Comprehensive motor cover including theft, accident and weather damage.', 520000, 5000, motorExclusions);
  policy('pol-2', CLIENT, 'POL-100232', price('electronics', 42000).indicativePremium, 'All-risk portable electronics cover.', 42000, 1500, deviceExclusions);
  policy('pol-3', PIETER, 'POL-100877', price('vehicle', 215000).indicativePremium, 'Comprehensive motor cover.', 215000, 4000, motorExclusions);
  policy('pol-4', PIETER, 'POL-100912', price('vehicle', 450000).indicativePremium, 'Comprehensive motor cover.', 450000, 12000, motorExclusions);
  asset({ id: 'ast-1', owner: CLIENT, assetType: 'vehicle', description: 'Toyota Hilux 2.8 GD-6 double cab', make: 'Toyota', model: 'Hilux', year: 2021, vin: 'AHTFB3CD600123456', registrationNumber: 'CA 482 913', mileageKm: 58000, purchasePrice: 520000, policyId: 'pol-1', status: 'INSURABLE' });
  asset({ id: 'ast-2', owner: CLIENT, assetType: 'electronics', description: 'MacBook Pro 14-inch', make: 'Apple', model: 'MacBook Pro', year: 2023, serialNumber: 'C02XK1ABC7', purchasePrice: 42000, policyId: 'pol-2', status: 'INSURABLE', portable: true });
  asset({ id: 'ast-3', owner: CLIENT, assetType: 'electronics', description: 'Canon EOS R6 camera kit', make: 'Canon', model: 'EOS R6', year: 2024, serialNumber: 'CN4401992', purchasePrice: 38000, status: 'UNDER_REVIEW', registeredAt: at(9), portable: true });
  asset({ id: 'ast-4', owner: CLIENT, assetType: 'property', description: 'Family home, Waterkloof Pretoria', address: '14 Jacaranda Street, Waterkloof, Pretoria', squareFootage: 240, constructionType: 'Brick', roofType: 'Tile', purchasePrice: 1850000, status: 'UNDER_REVIEW', registeredAt: at(3) });
  asset({ id: 'ast-5', owner: PIETER, assetType: 'vehicle', description: 'Volkswagen Polo Vivo 1.4', make: 'Volkswagen', model: 'Polo Vivo', year: 2019, vin: 'AAVZZZ6RZKU123789', registrationNumber: 'GP 330 221', mileageKm: 91000, purchasePrice: 215000, policyId: 'pol-3', status: 'INSURABLE' });
  asset({ id: 'ast-6', owner: PIETER, assetType: 'vehicle', description: 'Toyota Fortuner 2.8 GD-6 4x4', make: 'Toyota', model: 'Fortuner', year: 2022, vin: 'AHTKB3CD700654321', registrationNumber: 'GP 771 408', mileageKm: 34000, purchasePrice: 450000, policyId: 'pol-4', status: 'INSURABLE' });
  application('app-1', CLIENT, 'APP-2026-0101', 'ast-1', 'vehicle', 'ACCEPTED', 520000, { excess: 5000, coverLimit: 520000, exclusions: motorExclusions });
  application('app-2', CLIENT, 'APP-2026-0102', 'ast-2', 'electronics', 'ACCEPTED', 42000, { excess: 1500, coverLimit: 42000, exclusions: deviceExclusions });
  application('app-3', CLIENT, 'APP-2026-0188', 'ast-3', 'electronics', 'QUOTED', 38000, { excess: 1500, coverLimit: 38000, exclusions: deviceExclusions }, { quoteExpiresAt: at(-14) });
  application('app-4', CLIENT, 'APP-2026-0195', 'ast-4', 'property', 'SUBMITTED', 1850000, { excess: 0, coverLimit: 0, exclusions: [] }, { submittedAt: at(3) });
  application('app-5', PIETER, 'APP-2026-0140', 'ast-5', 'vehicle', 'ACCEPTED', 215000, { excess: 4000, coverLimit: 215000, exclusions: motorExclusions });
  application('app-6', PIETER, 'APP-2026-0161', 'ast-6', 'vehicle', 'ACCEPTED', 450000, { excess: 12000, coverLimit: 450000, exclusions: motorExclusions });

  type Claim = Record<string, any>;
  const claim = (c: Claim) => add('Claim', { tier: 2, riskScore: 0.3, fraudFlag: false, currentMilestone: c.status, ...c });
  const staffAssign = (claimId: string, role: keyof typeof PERSONAS, assignmentRole: string, isLead: boolean, days = 6) =>
    add('ClaimAssignment', { id: `asg-${claimId}-${role}`, claimId, userSubject: PERSONAS[role].userId, userDisplayNameSnapshot: staffName(role), userRoleSnapshot: PERSONAS[role].role, assignmentRole, isLead, active: true, assignedAt: at(days, 9) });
  let n = 0;
  const event = (claimId: string, milestone: string, summary: string, days: number, hour: number, actor = 'EasyInsure', actorRole = 'system', detail?: string, visibility = 'CLIENT_VISIBLE') =>
    add('ClaimActivity', { id: `act-${++n}`, claimId, eventId: `evt-${n}`, eventType: milestone, milestone, actorDisplayNameSnapshot: actor, actorRoleSnapshot: actorRole, summary, detail, visibility, occurredAt: at(days, hour) });
  const doc = (claimId: string, name: string, category: string, size: number, type = 'application/pdf') => {
    const id = `doc-${claimId}-${category}-${++n}`;
    add('ClaimDocument', { id, claimId, objectKey: `evidence/demo/${claimId}/${name}`, fileName: name, mediaType: type, byteSize: size, status: 'CLEAN', category, visibility: 'CLIENT_VISIBLE' });
    return id;
  };
  const message = (claimId: string, from: string, role: string, direction: string, body: string, days: number, hour: number) =>
    add('ClaimCommunication', { id: `msg-${++n}`, claimId, channel: 'PORTAL', direction, subject: 'Claim update', body, senderDisplayNameSnapshot: from, senderRoleSnapshot: role, deliveryState: 'DELIVERED', occurredAt: at(days, hour) });
  const note = (claimId: string, role: keyof typeof PERSONAS, body: string, days: number, hour: number) =>
    add('ClaimInternalNote', { id: `note-${++n}`, claimId, authorDisplayNameSnapshot: staffName(role), authorRoleSnapshot: PERSONAS[role].role, body, occurredAt: at(days, hour) });
  const assessment = (a: Record<string, any>) => add('ClaimAssessment', { exclusions: [], calculationVersion: 'claim-payout-2026-01', ...a });
  const job = (claimId: string, status: string, extra: Record<string, any> = {}) =>
    add('ProcessingJob', { id: `job-${claimId}-${++n}`, claimId, status, currentStep: status === 'SUCCEEDED' ? 'complete' : 'failed', attempts: 1, startedAt: at(1, 9), completedAt: at(1, 9), createdAt: at(1, 9), ...extra });
  const analysis = (claimId: string, a: { summary: string; recommendation: string; inconsistencies?: string[]; missing?: string[]; confidence: number; tier: number; riskTotal: number; riskLevel: string; factors: any[]; signals: any[]; fraudRisk: string; fraudRecommendation: string }) =>
    add('ClaimAnalysis', {
      id: `ana-${claimId}`, claimId, version: 1, aiSummary: a.summary, recommendation: a.recommendation, inconsistencies: a.inconsistencies ?? [],
      missingInformation: a.missing ?? [], warnings: [], confidence: a.confidence, modelId: MODEL_ID, inferenceStatus: 'SUCCEEDED',
      deterministicOutputs: {
        tier: { tier: a.tier },
        risk: { totalRiskScore: a.riskTotal, riskLevel: a.riskLevel, factors: a.factors },
        fraud: { isFlagged: a.fraudRisk !== 'low', overallRisk: a.fraudRisk, recommendation: a.fraudRecommendation, signals: a.signals },
      },
    });
  const signal = (signalName: string, triggered: boolean, severity: string, details: string) => ({ signalName, triggered, severity: triggered ? severity : 'low', details });

  // clm-1: waiting on a senior decision; the assessor and finaliser are not the senior persona, so Naledi can decide.
  claim({ id: 'clm-1', owner: CLIENT, claimNumber: 'CLM-20381', policeCaseNumber: 'CAS 214/09/2026', policyId: 'pol-1', assetId: 'ast-1', claimType: 'accidental_damage', description: 'Rear-ended at a traffic light on the N1; damage to the tailgate, bumper and canopy.', incidentLocation: 'N1 northbound near the Grayston off-ramp, Sandton', incidentDate: at(12, 17), amountRequested: 98000, status: 'DECISION_PENDING', suggestedPayout: 83200, submittedAt: at(10, 8) });
  staffAssign('clm-1', 'intermediate_officer', 'LEAD_ADVISOR', true); staffAssign('clm-1', 'senior_officer', 'SUPERVISOR', false);
  event('clm-1', 'SUBMITTED', 'Claim submitted', 10, 8, 'Thandi Mokoena', 'client'); event('clm-1', 'VALIDATING', 'Evidence scanned and validated', 9, 11);
  event('clm-1', 'UNDER_ASSESSMENT', 'Assessment started', 7, 9, staffName('intermediate_officer'), 'intermediate_officer');
  event('clm-1', 'UNDER_ASSESSMENT', `${staffName('intermediate_officer')} sent the payout assessment for senior review.`, 3, 14, staffName('intermediate_officer'), 'intermediate_officer', 'Quote matches the photos. Recommend standard depreciation of 10%.', 'INTERNAL');
  event('clm-1', 'DECISION_PENDING', 'Evidence review is complete and the payout recommendation awaits a human decision.', 2, 9, staffName('superuser'), 'superuser');
  const d1 = doc('clm-1', 'police-affidavit.pdf', 'AFFIDAVIT', 310_000); doc('clm-1', 'damage-photos.jpg', 'INCIDENT_EVIDENCE', 2_400_000, 'image/jpeg'); const d1q = doc('clm-1', 'panelbeater-quote.pdf', 'REPAIR_ESTIMATE', 540_000);
  message('clm-1', staffName('intermediate_officer'), 'intermediate_officer', 'OUTBOUND', 'Thanks Thandi, the panel beater quote and photos are enough for us to assess the claim.', 6, 12);
  note('clm-1', 'intermediate_officer', 'Quote is consistent with the photos. No signs of prior damage. Recommend standard depreciation of 10%.', 4, 10);
  assessment({ id: 'as-1', claimId: 'clm-1', claimOwner: CLIENT, version: 1, evidenceReviewed: [d1, d1q], coveredLossValue: 98000, repairEstimate: 98000, policyLimit: 520000, excess: 5000, depreciation: 0.1, recommendedPayout: 83200, status: 'FINALIZED', assessorSubject: PERSONAS.intermediate_officer.userId, assessorDisplayNameSnapshot: staffName('intermediate_officer'), assessorRoleSnapshot: 'intermediate_officer', createdAtSnapshot: at(4, 9), submittedAt: at(3, 14), submissionNote: 'Quote matches the photos. Recommend standard depreciation of 10%.', finalizedAt: at(2, 9), finalizedBySubject: PERSONAS.superuser.userId });
  analysis('clm-1', {
    summary: 'The client reports being rear-ended at a traffic light on the N1. The panel beater quote (R98,000) is consistent with the photographed damage to the tailgate, bumper and canopy, and the incident date matches the police case.',
    recommendation: 'Proceed on the repair quote. Standard depreciation applies; no indicators need escalation.', missing: ['The other driver\'s details were not supplied.'], confidence: 0.82, tier: 2, riskTotal: 0.3, riskLevel: 'medium',
    factors: [{ name: 'Expensive Asset', applied: true, weight: 0.5, reason: 'Asset value R520,000.00; threshold R200,000' }, { name: 'Good History Discount', applied: true, weight: -0.2, reason: 'No previous claims' }],
    signals: [signal('Repeated Claims', false, 'high', '0 claims in the last 12 months'), signal('High-Value Spike', false, 'high', 'Claim is 19% of asset value'), signal('Early Claim', false, 'medium', 'Incident occurred 188 days after policy start'), signal('Excessive Amount', false, 'high', 'Claim amount R98,000.00; threshold R500,000')],
    fraudRisk: 'low', fraudRecommendation: 'No significant rule-based indicators',
  });
  job('clm-1', 'SUCCEEDED');

  // clm-2: needs a reply from the client.
  claim({ id: 'clm-2', owner: CLIENT, claimNumber: 'CLM-20402', policeCaseNumber: 'CAS 301/09/2026', policyId: 'pol-2', assetId: 'ast-2', claimType: 'theft', description: 'Laptop stolen from a locked car outside a restaurant.', incidentLocation: 'Grayston Drive, Sandton', incidentDate: at(5, 19), amountRequested: 42000, status: 'INFO_NEEDED', currentMilestone: 'UNDER_ASSESSMENT', tier: 3, riskScore: 0.45, submittedAt: at(4, 8) });
  staffAssign('clm-2', 'junior_officer', 'LEAD_ADVISOR', true, 4);
  event('clm-2', 'SUBMITTED', 'Claim submitted', 4, 8, 'Thandi Mokoena', 'client'); event('clm-2', 'VALIDATING', 'Evidence scanned and validated', 3, 11);
  event('clm-2', 'UNDER_ASSESSMENT', 'Information requested from the client', 1, 15, staffName('junior_officer'), 'junior_officer');
  doc('clm-2', 'police-affidavit.pdf', 'AFFIDAVIT', 280_000);
  message('clm-2', staffName('junior_officer'), 'junior_officer', 'OUTBOUND', 'Please confirm the restaurant name and the time you parked.', 1, 15);
  job('clm-2', 'SUCCEEDED');

  // clm-3: a rule-based fraud indicator on an in-progress assessment for the *other* client.
  claim({ id: 'clm-3', owner: PIETER, claimNumber: 'CLM-20415', policeCaseNumber: 'CAS 077/10/2026', policyId: 'pol-3', assetId: 'ast-5', claimType: 'theft', description: 'Vehicle stolen from the driveway overnight.', incidentLocation: '22 Protea Road, Randburg', incidentDate: at(8, 22), amountRequested: 195000, status: 'UNDER_ASSESSMENT', tier: 2, riskScore: 0.7, fraudFlag: true, fraudReason: 'Require additional verification', submittedAt: at(7, 7) });
  staffAssign('clm-3', 'intermediate_officer', 'LEAD_ADVISOR', true, 7);
  event('clm-3', 'SUBMITTED', 'Claim submitted', 7, 7, 'Pieter van der Merwe', 'client'); event('clm-3', 'UNDER_ASSESSMENT', 'Assessment started', 5, 9, staffName('intermediate_officer'), 'intermediate_officer');
  doc('clm-3', 'police-affidavit.pdf', 'AFFIDAVIT', 295_000); doc('clm-3', 'tracker-report.pdf', 'INCIDENT_EVIDENCE', 410_000);
  note('clm-3', 'intermediate_officer', 'Tracker last ping was 2km from the home address. Escalating the fraud flag to a senior for context.', 3, 11);
  analysis('clm-3', {
    summary: 'The client reports the vehicle was stolen from the driveway overnight. The claim is 91% of the declared asset value, and the tracker report places the last signal about 2 km from the home address.',
    recommendation: 'Require additional verification before assessing: confirm the tracker timeline and obtain the key history.', inconsistencies: ['The affidavit says the vehicle was locked; no key history was provided.'], missing: ['Key history', 'Tracker recovery attempt log'],
    confidence: 0.64, tier: 2, riskTotal: 0.3, riskLevel: 'medium',
    factors: [{ name: 'Expensive Asset', applied: true, weight: 0.5, reason: 'Asset value R215,000.00; threshold R200,000' }, { name: 'Good History Discount', applied: true, weight: -0.2, reason: 'No previous claims' }],
    signals: [signal('Repeated Claims', false, 'high', '0 claims in the last 12 months'), signal('High-Value Spike', true, 'high', 'Claim is 91% of asset value'), signal('Early Claim', false, 'medium', 'Incident occurred 192 days after policy start'), signal('Excessive Amount', false, 'high', 'Claim amount R195,000.00; threshold R500,000')],
    fraudRisk: 'medium', fraudRecommendation: 'Require additional verification',
  });
  job('clm-3', 'SUCCEEDED');

  // clm-4: paid, ready for a senior to close.
  claim({ id: 'clm-4', owner: CLIENT, claimNumber: 'CLM-19804', policeCaseNumber: 'CAS 118/06/2026', policyId: 'pol-2', assetId: 'ast-2', claimType: 'accidental_damage', description: 'Screen cracked after a fall.', incidentLocation: 'Home, Waterkloof', incidentDate: at(60, 18), amountRequested: 14000, status: 'PAID', riskScore: 0.1, tier: 1, suggestedPayout: 12300, approvedPayout: 12300, approvedBy: PERSONAS.senior_officer.userId, submittedAt: at(58, 9) });
  staffAssign('clm-4', 'junior_officer', 'LEAD_ADVISOR', true, 58);
  ['SUBMITTED', 'VALIDATING', 'UNDER_ASSESSMENT', 'DECISION_PENDING', 'APPROVED', 'PAYMENT_PENDING', 'PAID'].forEach((m, i) => event('clm-4', m, `Claim ${m.toLowerCase().replace('_', ' ')}`, 58 - i * 4, 10));
  const d4 = doc('clm-4', 'police-affidavit.pdf', 'AFFIDAVIT', 250_000);
  assessment({ id: 'as-4', claimId: 'clm-4', claimOwner: CLIENT, version: 1, evidenceReviewed: [d4], coveredLossValue: 14000, repairEstimate: 13500, policyLimit: 42000, excess: 1500, depreciation: 0, recommendedPayout: 12000, status: 'FINALIZED', assessorSubject: PERSONAS.junior_officer.userId, assessorDisplayNameSnapshot: staffName('junior_officer'), assessorRoleSnapshot: 'junior_officer', createdAtSnapshot: at(46, 9), finalizedAt: at(42, 9), finalizedBySubject: SENIOR_2 });

  // clm-5: freshly validated, so a junior officer can start the assessment themselves.
  claim({ id: 'clm-5', owner: PIETER, claimNumber: 'CLM-20431', policeCaseNumber: 'CAS 190/10/2026', policyId: 'pol-3', assetId: 'ast-5', claimType: 'weather', description: 'Hail damage to the bonnet and roof.', incidentLocation: 'Fourways Mall parking, Johannesburg', incidentDate: at(3, 15), amountRequested: 22000, status: 'VALIDATING', tier: 1, riskScore: 0.15, submittedAt: at(2, 8) });
  staffAssign('clm-5', 'junior_officer', 'LEAD_ADVISOR', true, 2);
  event('clm-5', 'SUBMITTED', 'Claim submitted', 2, 8, 'Pieter van der Merwe', 'client'); event('clm-5', 'VALIDATING', 'Evidence scanned and validated', 1, 10);
  doc('clm-5', 'police-affidavit.pdf', 'AFFIDAVIT', 270_000); doc('clm-5', 'hail-damage.jpg', 'INCIDENT_EVIDENCE', 3_100_000, 'image/jpeg');
  job('clm-5', 'FAILED', { attempts: 2, errorCategory: 'WORKFLOW', errorMessage: 'Evidence scanning is incomplete', currentStep: 'validate' });

  // clm-6: above the R250,000 senior limit. Its finaliser is a second senior, so only the superuser can decide it.
  claim({ id: 'clm-6', owner: PIETER, claimNumber: 'CLM-20388', policeCaseNumber: 'CAS 402/09/2026', policyId: 'pol-4', assetId: 'ast-6', claimType: 'fire', description: 'Vehicle destroyed by a fire while parked at the client\'s workplace.', incidentLocation: 'Industrial Road, Kempton Park', incidentDate: at(14, 13), amountRequested: 420000, status: 'DECISION_PENDING', tier: 3, riskScore: 0.5, fraudFlag: true, fraudReason: 'Require additional verification', suggestedPayout: 340000, submittedAt: at(13, 8) });
  staffAssign('clm-6', 'intermediate_officer', 'LEAD_ADVISOR', true, 13);
  event('clm-6', 'SUBMITTED', 'Claim submitted', 13, 8, 'Pieter van der Merwe', 'client'); event('clm-6', 'VALIDATING', 'Evidence scanned and validated', 12, 10);
  event('clm-6', 'UNDER_ASSESSMENT', 'Assessment started', 10, 9, staffName('intermediate_officer'), 'intermediate_officer');
  event('clm-6', 'DECISION_PENDING', 'Evidence review is complete and the payout recommendation awaits a human decision.', 3, 9, 'Thabo Molefe', 'senior_officer');
  const d6 = doc('clm-6', 'police-affidavit.pdf', 'AFFIDAVIT', 330_000); const d6f = doc('clm-6', 'fire-brigade-report.pdf', 'INCIDENT_EVIDENCE', 880_000); doc('clm-6', 'scene-photos.jpg', 'INCIDENT_EVIDENCE', 4_200_000, 'image/jpeg');
  note('clm-6', 'intermediate_officer', 'Fire brigade report confirms an electrical fault in the engine bay. Total loss; replacement estimate used.', 5, 11);
  assessment({ id: 'as-6', claimId: 'clm-6', claimOwner: PIETER, version: 1, evidenceReviewed: [d6, d6f], coveredLossValue: 420000, replacementEstimate: 400000, policyLimit: 450000, excess: 12000, depreciation: 0.12, recommendedPayout: 340000, status: 'FINALIZED', assessorSubject: PERSONAS.intermediate_officer.userId, assessorDisplayNameSnapshot: staffName('intermediate_officer'), assessorRoleSnapshot: 'intermediate_officer', createdAtSnapshot: at(6, 9), finalizedAt: at(3, 9), finalizedBySubject: SENIOR_2 });
  analysis('clm-6', {
    summary: 'The vehicle was destroyed by a fire at the client\'s workplace. The fire brigade report attributes it to an electrical fault in the engine bay, which is consistent with the photos. The replacement estimate is below the claimed amount, and a total loss is always a high share of the asset value.',
    recommendation: 'Total loss on the replacement estimate with standard depreciation. The payout is above the senior approval limit and needs a superuser.', confidence: 0.78, tier: 3, riskTotal: 0.3, riskLevel: 'medium',
    factors: [{ name: 'Expensive Asset', applied: true, weight: 0.5, reason: 'Asset value R450,000.00; threshold R200,000' }, { name: 'Good History Discount', applied: true, weight: -0.2, reason: 'No previous claims' }],
    signals: [signal('Repeated Claims', false, 'high', '0 claims in the last 12 months'), signal('High-Value Spike', true, 'high', 'Claim is 93% of asset value'), signal('Early Claim', false, 'medium', 'Incident occurred 186 days after policy start'), signal('Excessive Amount', false, 'high', 'Claim amount R420,000.00; threshold R500,000')],
    fraudRisk: 'medium', fraudRecommendation: 'Require additional verification',
  });
  job('clm-6', 'SUCCEEDED');

  // One coherent timeline per claim: submission and last activity come from the recorded events.
  for (const c of db.Claim) {
    const events = db.ClaimActivity.filter((item) => item.claimId === c.id).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const submitted = events.find((item) => item.milestone === 'SUBMITTED');
    if (submitted) c.submittedAt = submitted.occurredAt;
    if (events.length) c.lastActivityAt = events[events.length - 1].occurredAt;
  }
  return db;
}
