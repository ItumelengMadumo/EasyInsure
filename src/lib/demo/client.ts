// In-memory stand-in for the Amplify data client. It mirrors only the surface the pages use
// (models.X.list, queries.*, mutations.*) and enforces the same role rules as the real backend,
// so every role sees and can do what it could in production. State lives in sessionStorage.
import { demoPersona, PERSONAS, type Persona } from './mode';
import { MODELS, seedDb, type Db } from './seed';
import {
  assetCategoryDefinitions, canOperateRole, estimatePremium, isDeveloperRole, isSeniorRole, isStaffRole, recommendPayout, validateApplication,
} from './rules';

const DB_KEY = 'ei-demo-db-v1';
type Args = Record<string, any>;
type Result = { data: any; errors?: { message: string }[] };

class DemoError extends Error {}
const deny = (message: string): never => { throw new DemoError(message); };

let cache: Db | null = null;
function storage(): Storage | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}
function db(): Db {
  if (cache) return cache;
  try { const raw = storage()?.getItem(DB_KEY); if (raw) cache = JSON.parse(raw) as Db; } catch { /* fall through to a fresh seed */ }
  return cache ??= seedDb();
}
function save() { try { storage()?.setItem(DB_KEY, JSON.stringify(cache)); } catch { /* quota or private mode: state stays in memory */ } }

export function resetDemoData() { cache = null; try { storage()?.removeItem(DB_KEY); } catch { /* nothing to clear */ } }

const find = (model: string, id: string) => db()[model].find((item) => item.id === id);
// Strictly increasing so events created in one tick keep their order in the timeline.
let lastTick = 0;
const now = () => new Date((lastTick = Math.max(Date.now(), lastTick + 1))).toISOString();
const uid = () => crypto.randomUUID();

/** Applies the same visibility the backend enforces through AppSync rules and getAssignedCasePortfolio. */
export function scopedData(persona: Persona): Db {
  const all = db();
  const role = persona.role;
  const ownFirst = <T extends { owner?: string }>(rows: T[]) => [...rows].sort((a, b) => Number(b.owner === persona.userId) - Number(a.owner === persona.userId));
  const byClaims = (claimIds: Set<string>, model: string) => all[model].filter((row) => claimIds.has(row.claimId));

  if (role === 'client') {
    const mine = (model: string) => all[model].filter((row) => row.owner === persona.userId);
    const claims = mine('Claim'); const ids = new Set(claims.map((claim) => claim.id)); const apps = mine('PolicyApplication');
    return {
      UserProfile: mine('UserProfile'), Asset: mine('Asset'), Policy: mine('Policy'), PolicyApplication: apps,
      PremiumAssessment: all.PremiumAssessment.filter((row) => apps.some((app) => app.id === row.applicationId)),
      Claim: claims, ClaimDocument: byClaims(ids, 'ClaimDocument'), ClaimAssignment: byClaims(ids, 'ClaimAssignment'),
      ClaimActivity: byClaims(ids, 'ClaimActivity').filter((row) => row.visibility === 'CLIENT_VISIBLE'),
      ClaimCommunication: byClaims(ids, 'ClaimCommunication'), ClaimInternalNote: [], ClaimAssessment: [],
    };
  }
  if (isSeniorRole(role) || isDeveloperRole(role)) {
    return { ...all, UserProfile: ownFirst(all.UserProfile) };
  }
  // Junior and intermediate officers only see claims they are actively assigned to.
  const assigned = new Set(all.ClaimAssignment.filter((row) => row.active && row.userSubject === persona.userId).map((row) => row.claimId));
  const claims = all.Claim.filter((claim) => assigned.has(claim.id));
  return {
    ...Object.fromEntries(MODELS.map((model) => [model, [] as any[]])),
    UserProfile: ownFirst(all.UserProfile),
    Asset: all.Asset.filter((row) => claims.some((claim) => claim.assetId === row.id)),
    Policy: all.Policy.filter((row) => claims.some((claim) => claim.policyId === row.id)),
    Claim: claims, ClaimDocument: byClaims(assigned, 'ClaimDocument'), ClaimAssignment: byClaims(assigned, 'ClaimAssignment'),
    ClaimActivity: byClaims(assigned, 'ClaimActivity'), ClaimCommunication: byClaims(assigned, 'ClaimCommunication'),
    ClaimInternalNote: byClaims(assigned, 'ClaimInternalNote'), ClaimAssessment: byClaims(assigned, 'ClaimAssessment'),
  };
}

const MILESTONES = ['SUBMITTED', 'VALIDATING', 'UNDER_ASSESSMENT', 'DECISION_PENDING', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'CLOSED'];

function activity(claim: any, me: Persona, summary: string, detail?: string, visibility = 'CLIENT_VISIBLE') {
  const milestone = MILESTONES.includes(claim.status) ? claim.status : claim.currentMilestone ?? 'UNDER_ASSESSMENT';
  const eventId = uid();
  db().ClaimActivity.push({
    id: eventId, claimId: claim.id, eventId, eventType: claim.status, milestone, actorDisplayNameSnapshot: me.name,
    actorRoleSnapshot: me.role, summary, detail, visibility, occurredAt: now(),
  });
  claim.currentMilestone = milestone; claim.lastActivityAt = now();
}

function claimFor(me: Persona, claimId: string) {
  const claim = find('Claim', claimId) ?? deny('That claim could not be found.');
  const assigned = db().ClaimAssignment.some((row) => row.claimId === claimId && row.active && row.userSubject === me.userId);
  const allowed = me.role === 'client' ? claim.owner === me.userId : isSeniorRole(me.role) || isDeveloperRole(me.role) || assigned;
  return allowed ? claim : deny('You do not have access to this claim.');
}
const requireOperator = (me: Persona) => canOperateRole(me.role) || deny('Your role cannot change case progress.');
const requireSenior = (me: Persona) => isSeniorRole(me.role) || deny('Senior officer permission is required.');
const requireClient = (me: Persona) => me.role === 'client' || deny('Only clients can do this.');
const requireStatus = (claim: any, ...statuses: string[]) =>
  statuses.includes(claim.status) || deny(`This action is not available while the claim is ${claim.status.toLowerCase().replaceAll('_', ' ')}.`);

function ownedApplication(me: Persona, id: string) {
  const app = find('PolicyApplication', id) ?? deny('That application could not be found.');
  return app.owner === me.userId || isStaffRole(me.role) ? app : deny('You do not have access to this application.');
}

const mutations: Record<string, (me: Persona, a: Args) => any> = {
  ensureUserProfile: (me) => db().UserProfile.find((p) => p.owner === me.userId),
  updateMyProfile: (me, a) => {
    const profile = db().UserProfile.find((p) => p.owner === me.userId) ?? deny('Profile not found.');
    profile.displayName = String(a.displayName ?? '').trim() || profile.displayName; return profile;
  },
  requestAccountClosure: () => ({ ok: true }),

  createAssetApplicationDraft: (me, a) => {
    requireClient(me);
    const app = { id: `app-${uid()}`, owner: me.userId, applicationNumber: null, assetId: null, assetType: a.assetType, schemaVersion: 'demo-1', status: 'DRAFT', answers: {}, completedSections: [], missingInformation: [], lastUpdatedAt: now() };
    db().PolicyApplication.push(app); return app;
  },
  saveAssetApplicationSection: (me, a) => {
    const app = ownedApplication(me, a.applicationId); if (app.status !== 'DRAFT') deny('Only draft applications can be edited.');
    app.answers = { ...app.answers, ...JSON.parse(a.answers) };
    if (!app.completedSections.includes(a.section)) app.completedSections.push(a.section);
    app.lastUpdatedAt = now(); return app;
  },
  registerApplicationDocument: (me, a) => { ownedApplication(me, a.applicationId); return { ok: true }; },
  submitAssetApplication: (me, a) => {
    const app = ownedApplication(me, a.applicationId); if (app.status !== 'DRAFT') deny('This application was already submitted.');
    const x = app.answers; const price = Number(x.purchasePrice);
    const missing = validateApplication(app.assetType, x);
    if (missing.length) deny(`Complete the required answers first: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''}.`);
    if (!Number.isFinite(price) || price <= 0) deny('Enter the replacement value before submitting.');
    const assetId = `ast-${uid()}`;
    db().Asset.push({
      id: assetId, owner: me.userId, assetType: app.assetType, description: x.description || 'New asset', purchasePrice: price,
      purchaseDate: x.purchaseDate || now().slice(0, 10), condition: x.condition || 'average', make: x.make, model: x.model,
      year: x.year ? Number(x.year) : null, serialNumber: x.serialNumber, vin: x.vin, registrationNumber: x.registrationNumber,
      address: x.address, squareFootage: x.squareFootage ? Number(x.squareFootage) : null, constructionType: x.constructionType,
      roofType: x.roofType, occupancyType: x.occupancyType, purchaseSource: x.purchaseSource, securityFeatures: x.securityFeatures, assetUse: x.assetUse, portable: x.portable ?? false,
      status: 'UNDER_REVIEW', registeredAt: now(), lastUpdatedAt: now(),
      searchText: [x.description, x.make, x.model, x.vin, x.serialNumber].filter(Boolean).join(' '),
    });
    const assessmentId = `pa-${uid()}`;
    db().PremiumAssessment.push({ id: assessmentId, applicationId: app.id, ...estimatePremium(app.assetType, x) });
    Object.assign(app, { status: 'SUBMITTED', assetId, latestAssessmentId: assessmentId, submittedAt: now(), lastUpdatedAt: now(), applicationNumber: `APP-2026-${String(200 + db().PolicyApplication.length).padStart(4, '0')}` });
    return app;
  },
  reviewPolicyApplication: (me, a) => {
    requireSenior(me); const app = find('PolicyApplication', a.applicationId) ?? deny('That application could not be found.');
    if (!['UNDER_REVIEW', 'DECLINED'].includes(a.decision)) deny('Unsupported review decision.');
    app.status = a.decision; app.lastUpdatedAt = now();
    if (a.decision === 'DECLINED') { const asset = find('Asset', app.assetId); if (asset) asset.status = 'DECLINED'; }
    return app;
  },
  issuePolicyQuote: (me, a) => {
    requireSenior(me); const app = find('PolicyApplication', a.applicationId) ?? deny('That application could not be found.');
    if (app.status !== 'UNDER_REVIEW') deny('Begin the review before issuing a quote.');
    const premium = Number(a.monthlyPremium); const indicative = find('PremiumAssessment', app.latestAssessmentId)?.indicativePremium ?? premium;
    if (!(premium > 0)) deny('Enter a valid monthly premium.');
    if (Math.abs(premium - indicative) > indicative * 0.1 && String(a.overrideReason ?? '').trim().length < 5) deny('Explain why the premium is outside ±10% of the indicative amount.');
    Object.assign(app, { status: 'QUOTED', quotedPremium: premium, quoteExpiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(), lastUpdatedAt: now() });
    return app;
  },
  acceptPolicyQuote: (me, a) => {
    requireClient(me); const app = ownedApplication(me, a.applicationId); if (app.status !== 'QUOTED') deny('There is no open quote to accept.');
    const policyId = `pol-${uid()}`;
    db().Policy.push({
      id: policyId, owner: me.userId, policyNumber: `POL-${100900 + db().Policy.length}`, valuationType: 'agreed_value', coverageDetails: null,
      durationMonths: 12, startDate: now().slice(0, 10), endDate: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
      status: 'ACTIVE', approvedPremium: app.quotedPremium, suggestedPremium: app.quotedPremium,
    });
    const asset = find('Asset', app.assetId); if (asset) Object.assign(asset, { policyId, status: 'INSURABLE' });
    app.status = 'ACCEPTED'; app.lastUpdatedAt = now(); return app;
  },

  createClaimDraft: (me, a) => {
    requireClient(me);
    const policy = find('Policy', a.policyId); const asset = find('Asset', a.assetId);
    if (!policy || policy.owner !== me.userId || !asset || asset.policyId !== policy.id) deny('Select an asset linked to your active policy.');
    if (policy.status !== 'ACTIVE') deny('That policy is not active.');
    const claim = {
      id: `clm-${uid()}`, owner: me.userId, claimNumber: null, policeCaseNumber: a.policeCaseNumber, policyId: a.policyId, assetId: a.assetId,
      claimType: a.claimType, description: a.description, incidentDate: a.incidentDate, amountRequested: null, status: 'DRAFT', tier: null,
      riskScore: null, fraudFlag: false, currentMilestone: null, submittedAt: null, lastActivityAt: now(),
    };
    db().Claim.push(claim); return claim;
  },
  registerClaimDocument: (me, a) => {
    const claim = claimFor(me, a.claimId);
    const document = { id: `doc-${uid()}`, claimId: claim.id, fileName: a.fileName, mediaType: a.mediaType, byteSize: a.byteSize, status: 'CLEAN', category: a.category, visibility: 'CLIENT_VISIBLE' };
    db().ClaimDocument.push(document); return document;
  },
  submitClaimDraft: (me, a) => {
    requireClient(me); const claim = claimFor(me, a.claimId); requireStatus(claim, 'DRAFT');
    if (!db().ClaimDocument.some((d) => d.claimId === claim.id && d.category === 'AFFIDAVIT')) deny('A police affidavit is required for every claim.');
    // The real system assigns asynchronously on a schedule; the demo assigns instantly so the case moves.
    const lead = PERSONAS.junior_officer;
    Object.assign(claim, { claimNumber: `CLM-${20500 + db().Claim.length}`, status: 'VALIDATING', tier: 1, riskScore: 18, submittedAt: now() });
    db().ClaimAssignment.push({ id: `asg-${uid()}`, claimId: claim.id, userSubject: lead.userId, userDisplayNameSnapshot: lead.name, userRoleSnapshot: lead.role, assignmentRole: 'LEAD_ADVISOR', isLead: true, active: true, assignedAt: now() });
    activity({ ...claim, status: 'SUBMITTED' }, me, 'Claim submitted');
    activity(claim, PERSONAS.junior_officer, 'Evidence scanned and a lead advisor assigned', `${lead.name} is your lead advisor.`);
    return claim;
  },
  assignClaimTeamMember: (me, a) => {
    requireSenior(me); const claim = claimFor(me, a.claimId);
    if (a.isLead) db().ClaimAssignment.filter((row) => row.claimId === claim.id && row.isLead && row.active).forEach((row) => Object.assign(row, { active: false, endedAt: now() }));
    const row = { id: `asg-${uid()}`, claimId: claim.id, userSubject: a.userSubject, userDisplayNameSnapshot: a.displayName, userRoleSnapshot: a.userRole, assignmentRole: a.assignmentRole, isLead: Boolean(a.isLead), active: true, assignedAt: now() };
    db().ClaimAssignment.push(row); activity(claim, me, `${a.displayName} joined the case team`, undefined, 'INTERNAL'); return row;
  },
  sendClaimCommunication: (me, a) => {
    const claim = claimFor(me, a.claimId); if (claim.status === 'CLOSED') deny('This claim is closed.');
    const row = { id: `msg-${uid()}`, claimId: claim.id, channel: me.role === 'client' ? 'PORTAL' : a.channel, direction: me.role === 'client' ? 'INBOUND' : 'OUTBOUND', subject: a.subject, body: a.body, senderDisplayNameSnapshot: me.name, senderRoleSnapshot: me.role, deliveryState: 'DELIVERED', occurredAt: now() };
    db().ClaimCommunication.push(row); claim.lastActivityAt = now(); return row;
  },
  addClaimInternalNote: (me, a) => {
    requireOperator(me); const claim = claimFor(me, a.claimId);
    const row = { id: `note-${uid()}`, claimId: claim.id, authorDisplayNameSnapshot: me.name, authorRoleSnapshot: me.role, body: a.body, occurredAt: now() };
    db().ClaimInternalNote.push(row); return row;
  },
  requestClaimInformation: (me, a) => {
    requireOperator(me); const claim = claimFor(me, a.claimId); requireStatus(claim, 'VALIDATING', 'UNDER_ASSESSMENT');
    claim.currentMilestone = claim.status; claim.status = 'INFO_NEEDED';
    db().ClaimCommunication.push({ id: `msg-${uid()}`, claimId: claim.id, channel: 'PORTAL', direction: 'OUTBOUND', subject: 'Information needed', body: a.request, senderDisplayNameSnapshot: me.name, senderRoleSnapshot: me.role, deliveryState: 'DELIVERED', occurredAt: now() });
    activity(claim, me, 'Information requested from the client', a.request); return claim;
  },
  provideClaimInformation: (me, a) => {
    requireClient(me); const claim = claimFor(me, a.claimId); requireStatus(claim, 'INFO_NEEDED');
    db().ClaimCommunication.push({ id: `msg-${uid()}`, claimId: claim.id, channel: 'PORTAL', direction: 'INBOUND', subject: 'Information provided', body: a.response, senderDisplayNameSnapshot: me.name, senderRoleSnapshot: me.role, deliveryState: 'DELIVERED', occurredAt: now() });
    claim.status = 'UNDER_ASSESSMENT'; activity(claim, me, 'Client provided the requested information'); return claim;
  },
  startClaimProcessing: (me, a) => {
    requireOperator(me); const claim = claimFor(me, a.claimId); requireStatus(claim, 'VALIDATING');
    claim.status = 'UNDER_ASSESSMENT'; activity(claim, me, 'Assessment started'); return claim;
  },
  logClaimCall: (me, a) => {
    requireOperator(me); const claim = claimFor(me, a.claimId);
    activity(claim, me, `${a.direction === 'INBOUND' ? 'Incoming' : 'Outgoing'} call logged`, `${a.outcome}${a.advisorNotes ? ` · ${a.advisorNotes}` : ''}`, 'INTERNAL'); return claim;
  },
  calculateClaimPayoutAssessment: (me, a) => {
    requireOperator(me); const claim = claimFor(me, a.claimId); requireStatus(claim, 'UNDER_ASSESSMENT');
    const input = { coveredLossValue: Number(a.coveredLossValue), policyLimit: Number(a.policyLimit), excess: Number(a.excess), depreciation: Number(a.depreciation) };
    if (Object.values(input).some((value) => !Number.isFinite(value) || value < 0)) deny('Enter valid, non-negative assessment figures.');
    const version = db().ClaimAssessment.filter((row) => row.claimId === claim.id).length + 1;
    const row = { id: `as-${uid()}`, claimId: claim.id, version, evidenceReviewed: a.evidenceReviewed ?? [], ...input, repairEstimate: a.repairEstimate ?? null, replacementEstimate: a.replacementEstimate ?? null, exclusions: a.exclusions ?? [], recommendedPayout: recommendPayout({ ...input, repairEstimate: Number.isFinite(Number(a.repairEstimate)) && a.repairEstimate != null ? Number(a.repairEstimate) : undefined, replacementEstimate: a.replacementEstimate != null && Number.isFinite(Number(a.replacementEstimate)) ? Number(a.replacementEstimate) : undefined }), status: 'DRAFT' };
    db().ClaimAssessment.push(row); return row;
  },
  finalizeClaimPayoutAssessment: (me, a) => {
    requireSenior(me); const assessment = find('ClaimAssessment', a.assessmentId) ?? deny('That assessment could not be found.');
    if (assessment.status !== 'DRAFT') deny('Only draft assessments can be finalised.');
    const claim = claimFor(me, assessment.claimId);
    assessment.status = 'FINAL'; claim.suggestedPayout = assessment.recommendedPayout; claim.status = 'DECISION_PENDING';
    activity(claim, me, 'Assessment finalised for a payout decision'); return assessment;
  },
  approveClaim: (me, a) => {
    requireSenior(me); const claim = claimFor(me, a.claimId); requireStatus(claim, 'DECISION_PENDING');
    const amount = Number(a.approvedPayout);
    if (!Number.isFinite(amount) || amount < 0) deny('Enter a valid payout amount.');
    if (amount !== (claim.suggestedPayout ?? 0) && String(a.overrideReason ?? '').trim().length < 5) deny('Explain why the payout differs from the assessed amount.');
    claim.approvedPayout = amount; claim.status = 'APPROVED'; activity(claim, me, 'Claim approved', `Approved payout of R ${amount.toLocaleString('en-ZA')}.`); return claim;
  },
  rejectClaim: (me, a) => {
    requireSenior(me); const claim = claimFor(me, a.claimId); requireStatus(claim, 'DECISION_PENDING');
    claim.status = 'REJECTED'; activity(claim, me, 'Claim rejected', a.reason); return claim;
  },
  transitionClaim: (me, a) => {
    requireOperator(me); const claim = claimFor(me, a.claimId);
    if (!(claim.status === 'APPROVED' && a.targetStatus === 'PAYMENT_PENDING')) deny('That progress step is not allowed from the current status.');
    claim.status = 'PAYMENT_PENDING'; activity(claim, me, a.summary); return claim;
  },
  recordClaimPayout: (me, a) => {
    requireOperator(me); const claim = claimFor(me, a.claimId); requireStatus(claim, 'PAYMENT_PENDING');
    claim.status = 'PAID'; activity(claim, me, 'Payout recorded', `Reference ${a.paymentReference}.`); return claim;
  },
  closeClaim: (me, a) => {
    requireSenior(me); const claim = claimFor(me, a.claimId); requireStatus(claim, 'PAID', 'REJECTED');
    claim.status = 'CLOSED'; claim.closedAt = now(); activity(claim, me, 'Case closed', a.summary); return claim;
  },
};

function run(name: string, args: Args = {}): Result {
  try {
    const data = mutations[name](demoPersona(), args);
    save(); return { data, errors: undefined };
  } catch (error) {
    if (error instanceof DemoError) return { data: null, errors: [{ message: error.message }] };
    throw error;
  }
}

export function createDemoClient(): any {
  const mutationProxy = new Proxy({}, { get: (_t, name: string) => async (args?: Args) => run(name, args) });
  const models = Object.fromEntries(MODELS.map((model) => [model, {
    list: async () => ({ data: scopedData(demoPersona())[model], nextToken: null, errors: [] }),
    onUpdate: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) }),
  }]));
  return {
    models,
    mutations: mutationProxy,
    queries: {
      getAssetCategoryDefinitions: async () => ({ data: assetCategoryDefinitions(), errors: undefined }),
      getAssignedCasePortfolio: async () => {
        const s = scopedData(demoPersona());
        return {
          errors: undefined,
          data: {
            assets: s.Asset, policies: s.Policy, claims: s.Claim, documents: s.ClaimDocument, assignments: s.ClaimAssignment,
            activities: s.ClaimActivity, communications: s.ClaimCommunication, internalNotes: s.ClaimInternalNote, claimAssessments: s.ClaimAssessment,
          },
        };
      },
    },
  };
}
