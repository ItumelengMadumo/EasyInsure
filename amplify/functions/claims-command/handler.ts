import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
  ACCEPTED_DOCUMENT_STATES, ALLOWED_MEDIA_TYPES, MAX_DOCUMENT_BYTES, assertDecisionAuthority, canManuallyTransition,
  coerceJsonObject, parseQuarantineKey, resolveProfileIdentity, validateDraftPrerequisites,
} from './domain';
import { ASSET_SCHEMA_VERSION, PREMIUM_FORMULA_VERSION, calculatePremium, calculateRecommendedPayout, categoryDefinitions, validateApplication } from './underwriting';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as never);
Amplify.configure(resourceConfig, libraryOptions);
const client: any = generateClient();
const stepFunctions = new SFNClient({});
const sqs = new SQSClient({});

type ResolverEvent = {
  fieldName: string;
  arguments: Record<string, unknown>;
  identity?: { sub?: string; claims?: Record<string, unknown> };
};
type Actor = { subject: string; groups: string[]; displayName: string; email: string; role: string };

const staffGroups = ['junior_officer', 'intermediate_officer', 'senior_officer', 'developer', 'superuser'];
const seniorGroups = ['senior_officer', 'superuser'];

function identity(event: ResolverEvent): Actor {
  const claims = event.identity?.claims ?? {};
  const subject = event.identity?.sub ?? String(claims.sub ?? '');
  const raw = claims['cognito:groups'];
  const groups = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(',') : [];
  if (!subject) throw new Error('Authenticated subject is required');
  const displayName = String(claims.name ?? claims.preferred_username ?? claims.email ?? subject);
  return { subject, groups, displayName, email: String(claims.email ?? `${subject}@profile.invalid`), role: groups[0] ?? 'client' };
}

function isStaff(actor: Actor) { return actor.groups.some((group) => staffGroups.includes(group)); }
function isSenior(actor: Actor) { return actor.groups.some((group) => seniorGroups.includes(group)); }
function isDeveloper(actor: Actor) { return actor.groups.includes('developer'); }
function requireStaff(actor: Actor) { if (!isStaff(actor)) throw new Error('Officer access required'); }
function requireCaseOfficer(actor: Actor) { if (!isStaff(actor) || isDeveloper(actor)) throw new Error('Case officer access required'); }
function requireSenior(actor: Actor) { if (!isSenior(actor)) throw new Error('Senior officer access required'); }
const now = () => new Date().toISOString();
const clean = (value: unknown, field: string, min = 1) => {
  const result = String(value ?? '').trim();
  if (result.length < min) throw new Error(`${field} is required`);
  return result;
};

// list() returns a single page; every read here must see the full result set or
// idempotency checks, access checks and workload balancing silently go wrong.
async function listAll(model: any, args: Record<string, unknown> = {}) {
  const data: any[] = [];
  let nextToken: string | null | undefined;
  do {
    const page = await model.list({ ...args, limit: 1000, nextToken });
    if (page.errors?.length) throw new Error(page.errors[0].message);
    data.push(...(page.data ?? []));
    nextToken = page.nextToken;
  } while (nextToken);
  return { data };
}

const CLAIM_FIELDS = `id owner claimNumber policeCaseNumber policyId assetId claimType description incidentDate
  incidentLocation amountRequested legacyRequestedAmount tier status riskScore fraudFlag fraudReason suggestedPayout
  approvedPayout approvedBy approvalTimestamp assignedOfficerId currentMilestone submittedAt closedAt lastActivityAt
  assignmentDueAt idempotencyKey createdAt updatedAt`;
const APPLICATION_FIELDS = `id owner applicationNumber assetId assetType schemaVersion status answers completedSections
  missingInformation underwritingProfileId latestAssessmentId quotedPremium quoteExpiresAt submittedAt acceptedAt
  assignedUnderwriterId idempotencyKey lastUpdatedAt createdAt updatedAt`;
const ASSESSMENT_FIELDS = `id claimId claimOwner version evidenceReviewed coveredLossValue repairEstimate replacementEstimate
  policyLimit excess depreciation exclusions recommendedPayout calculationVersion status assessorSubject
  assessorDisplayNameSnapshot assessorRoleSnapshot overrideReason createdAtSnapshot finalizedAt finalizedBySubject
  idempotencyKey correlationId createdAt updatedAt`;

// Optimistic concurrency: the write only lands if `status` still holds the value we
// validated against, so two officers cannot both approve, or approve and reject.
async function updateIfStatus(model: 'Claim' | 'PolicyApplication' | 'ClaimAssessment', fields: string, input: Record<string, unknown>, expectedStatus: string) {
  try {
    const result: any = await client.graphql({
      query: `mutation Guarded($input: Update${model}Input!, $condition: Model${model}ConditionInput) {
        update${model}(input: $input, condition: $condition) { ${fields} } }`,
      variables: { input, condition: { status: { eq: expectedStatus } } },
    });
    return result.data[`update${model}`];
  } catch (error: any) {
    const message = error?.errors?.[0]?.errorType ?? error?.errors?.[0]?.message ?? String(error);
    if (String(message).includes('ConditionalCheckFailed')) {
      throw new Error('This record was changed by someone else. Refresh and try again.', { cause: error });
    }
    throw new Error(error?.errors?.[0]?.message ?? 'Update failed', { cause: error });
  }
}

const reference = (prefix: string) => `${prefix}-${new Date().getUTCFullYear()}-${randomBytes(5).toString('hex').toUpperCase()}`;

async function audit(entityId: string, action: string, actor: Actor, previousValue: unknown, newValue: unknown, correlationId: string) {
  const { errors } = await client.models.AuditEvent.create({
    entityType: 'claim', entityId, action, actorSubject: actor.subject, actorGroups: actor.groups,
    previousValue: previousValue as never, newValue: newValue as never, correlationId, occurredAt: now(),
  });
  if (errors?.length) throw new Error(`Audit write failed: ${errors[0].message}`);
}

async function activity(claim: any, eventType: string, milestone: string, summary: string, actor: Actor, correlationId: string, detail?: string) {
  const occurredAt = now();
  const { errors } = await client.models.ClaimActivity.create({
    owner: claim.owner, claimId: claim.id, eventId: randomUUID(), eventType, milestone,
    actorSubject: actor.subject, actorDisplayNameSnapshot: actor.displayName, actorRoleSnapshot: actor.role,
    summary, detail, visibility: 'CLIENT_VISIBLE', occurredAt, correlationId,
  });
  if (errors?.length) throw new Error(`Activity write failed: ${errors[0].message}`);
  await client.models.Claim.update({ id: claim.id, lastActivityAt: occurredAt, currentMilestone: milestone });
}

async function getClaim(claimId: string) {
  const { data, errors } = await client.models.Claim.get({ id: claimId });
  if (errors?.length || !data) throw new Error('Claim not found');
  return data;
}

async function canAccessClaim(actor: Actor, claim: any) {
  if (claim.owner === actor.subject || isSenior(actor)) return true;
  if (!isStaff(actor)) return false;
  const assignments = await listAll(client.models.ClaimAssignment, {
    filter: { claimId: { eq: claim.id }, userSubject: { eq: actor.subject }, active: { eq: true } },
  });
  return assignments.data.length > 0;
}

async function autoAssignLead(claim: any, actor: Actor, correlationId: string) {
  const profiles = await listAll(client.models.UserProfile, { filter: { status: { eq: 'active' } } });
  const eligible = profiles.data.filter((profile: any) =>
    ['junior_officer', 'intermediate_officer', 'senior_officer'].includes(profile.businessRole));
  if (!eligible.length) return null;
  const loads = await Promise.all(eligible.map(async (profile: any) => {
    const assignments = await listAll(client.models.ClaimAssignment, {
      filter: { userSubject: { eq: profile.owner }, active: { eq: true } },
    });
    return { profile, load: assignments.data.length };
  }));
  loads.sort((left, right) => left.load - right.load || String(left.profile.owner).localeCompare(String(right.profile.owner)));
  const selected = loads[0].profile;
  const assignedAt = now();
  // The scheduled assignment worker races this path; whoever moves the claim out of
  // ASSIGNMENT_PENDING first owns the assignment, so there is only ever one lead.
  try {
    await updateIfStatus('Claim', CLAIM_FIELDS, {
      id: claim.id, assignedOfficerId: selected.owner, status: 'VALIDATING',
      currentMilestone: 'VALIDATING', lastActivityAt: assignedAt,
    }, 'ASSIGNMENT_PENDING');
  } catch {
    return null;
  }
  const result = await client.models.ClaimAssignment.create({
    claimId: claim.id, claimOwner: claim.owner, userSubject: selected.owner,
    userDisplayNameSnapshot: selected.displayName ?? selected.email,
    userRoleSnapshot: selected.businessRole, assignmentRole: 'LEAD_ADVISOR', isLead: true,
    active: true, assignedAt, assignedBy: actor.subject, correlationId,
  });
  if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Advisor assignment failed');
  await activity(claim, 'ADVISOR_ASSIGNED', 'VALIDATING', `${selected.displayName ?? 'An advisor'} is now leading your claim.`, actor, correlationId);
  return result.data;
}

async function enqueueCommunication(communicationId: string, claimId: string, channel: string, correlationId: string) {
  const queueUrl = process.env.COMMUNICATION_QUEUE_URL;
  if (!queueUrl || channel === 'PORTAL') return;
  await sqs.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify({ communicationId, claimId, channel, correlationId }),
  }));
}

export const handler = async (event: ResolverEvent) => {
  const actor = identity(event);
  const args = event.arguments;
  const correlationId = String(args.correlationId || randomUUID());

  if (event.fieldName === 'getAssetCategoryDefinitions') return categoryDefinitions;

  if (event.fieldName === 'searchAssets') {
    const result = await listAll(client.models.Asset, {});
    const query = String(args.query ?? '').trim().toLowerCase();
    const filters = (args.filters ?? {}) as Record<string, unknown>;
    let items = result.data.filter((item: any) => (item.owner === actor.subject || isSenior(actor)) &&
      (!query || String(item.searchText ?? '').includes(query)) &&
      (!filters.assetType || item.assetType === filters.assetType) &&
      (!filters.status || item.status === filters.status) &&
      (!filters.condition || item.condition === filters.condition) &&
      (!filters.coverStatus || (filters.coverStatus === 'COVERED' ? Boolean(item.policyId) : !item.policyId)) &&
      (!filters.minValue || item.purchasePrice >= Number(filters.minValue)) &&
      (!filters.maxValue || item.purchasePrice <= Number(filters.maxValue)));
    const sort = String(args.sort ?? 'newest');
    items = items.sort((left: any, right: any) =>
      sort === 'value_asc' ? left.purchasePrice - right.purchasePrice :
      sort === 'value_desc' ? right.purchasePrice - left.purchasePrice :
      sort === 'category' ? left.assetType.localeCompare(right.assetType) :
      String(right.registeredAt ?? right.createdAt).localeCompare(String(left.registeredAt ?? left.createdAt)));
    return items;
  }

  if (event.fieldName === 'createAssetApplicationDraft') {
    const assetType = String(args.assetType);
    if (!categoryDefinitions[assetType]) throw new Error('Unsupported asset category');
    const key = String(args.idempotencyKey);
    const prior = await listAll(client.models.PolicyApplication, { filter: { idempotencyKey: { eq: key }, owner: { eq: actor.subject } } });
    if (prior.data[0]) return prior.data[0];
    const result = await client.models.PolicyApplication.create({
      owner: actor.subject, assetType, schemaVersion: ASSET_SCHEMA_VERSION, status: 'DRAFT',
      answers: {}, completedSections: [], missingInformation: [], idempotencyKey: key, lastUpdatedAt: now(),
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Application draft failed');
    return result.data;
  }

  if (event.fieldName === 'saveAssetApplicationSection') {
    const application = await client.models.PolicyApplication.get({ id: String(args.applicationId) });
    if (!application.data || (application.data.owner !== actor.subject && !isSenior(actor))) throw new Error('Application not found');
    if (application.data.status !== 'DRAFT' && application.data.status !== 'MORE_INFO_REQUIRED') throw new Error('This application is read-only');
    const merged = { ...coerceJsonObject(application.data.answers, 'answers'), ...coerceJsonObject(args.answers, 'answers') };
    const section = clean(args.section, 'section');
    const completed = [...new Set([...(application.data.completedSections ?? []), section])];
    const result = await client.models.PolicyApplication.update({
      id: application.data.id, answers: merged, completedSections: completed, lastUpdatedAt: now(),
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Application save failed');
    return result.data;
  }

  if (event.fieldName === 'calculateIndicativePremium' || event.fieldName === 'submitAssetApplication') {
    const application = await client.models.PolicyApplication.get({ id: String(args.applicationId) });
    if (!application.data || (application.data.owner !== actor.subject && !isSenior(actor))) throw new Error('Application not found');
    const answers = application.data.answers as Record<string, unknown>;
    const missing = validateApplication(application.data.assetType, answers);
    if (event.fieldName === 'submitAssetApplication') {
      const documents = await listAll(client.models.ApplicationDocument, { filter: { applicationId: { eq: application.data.id } } });
      if (!documents.data.some((document: any) => document.category === 'VALUATION' && ACCEPTED_DOCUMENT_STATES.includes(document.status))) {
        missing.push('Purchase invoice or valuation document');
      }
    }
    if (missing.length) {
      await client.models.PolicyApplication.update({ id: application.data.id, missingInformation: missing, status: 'MORE_INFO_REQUIRED', lastUpdatedAt: now() });
      throw new Error(`Complete these fields: ${missing.join(', ')}`);
    }
    const key = String(args.idempotencyKey);
    const existingAssessment = await listAll(client.models.PremiumAssessment, { filter: { idempotencyKey: { eq: key }, owner: { eq: application.data.owner } } });
    let assessment = existingAssessment.data[0];
    if (!assessment) {
      const profileHistory = await listAll(client.models.UnderwritingProfile, { filter: { owner: { eq: application.data.owner } } });
      const profile = await client.models.UnderwritingProfile.create({
        owner: application.data.owner, version: profileHistory.data.length + 1, consentGiven: true, consentedAt: now(),
        declarations: answers, createdAtSnapshot: now(),
      });
      const calculated = calculatePremium(application.data.assetType, answers);
      const created = await client.models.PremiumAssessment.create({
        owner: application.data.owner, applicationId: application.data.id, version: 1,
        formulaVersion: PREMIUM_FORMULA_VERSION, inputSnapshot: answers, factors: calculated.factors,
        riskScore: calculated.riskScore, indicativePremium: calculated.indicativePremium,
        rangeLow: calculated.rangeLow, rangeHigh: calculated.rangeHigh, assumptions: calculated.assumptions,
        actorSubject: actor.subject, actorDisplayNameSnapshot: actor.displayName, createdAtSnapshot: now(), idempotencyKey: key,
      });
      if (created.errors?.length || !created.data) throw new Error(created.errors?.[0]?.message ?? 'Premium calculation failed');
      assessment = created.data;
      await client.models.PolicyApplication.update({ id: application.data.id, latestAssessmentId: assessment.id, underwritingProfileId: profile.data?.id, lastUpdatedAt: now() });
    }
    if (event.fieldName === 'calculateIndicativePremium') return assessment;
    if (application.data.status !== 'DRAFT' && application.data.status !== 'MORE_INFO_REQUIRED') return application.data;
    const registeredAt = now();
    const searchable = ['description', 'make', 'model', 'serialNumber', 'vin', 'registrationNumber', 'address']
      .map((keyName) => answers[keyName]).filter(Boolean).join(' ');
    const asset = await client.models.Asset.create({
      owner: application.data.owner, assetType: application.data.assetType, description: String(answers.description),
      purchasePrice: Number(answers.purchasePrice), purchaseDate: new Date(String(answers.purchaseDate)).toISOString(),
      condition: String(answers.condition), make: answers.make, model: answers.model, year: Number(answers.year) || undefined,
      serialNumber: answers.serialNumber, registrationNumber: answers.registrationNumber, vin: answers.vin,
      mileageKm: Number(answers.mileageKm) || undefined, address: answers.address, squareFootage: Number(answers.squareFootage) || undefined,
      constructionType: answers.constructionType, roofType: answers.roofType, occupancyType: answers.occupancyType,
      securityFeatures: answers.securityFeatures, purchaseSource: answers.purchaseSource, assetUse: answers.assetUse,
      portable: Boolean(answers.portable), status: 'UNDER_REVIEW',
      searchText: `${application.data.assetType} ${searchable} ${application.data.applicationNumber ?? ''}`.toLowerCase(),
      registeredAt, lastUpdatedAt: registeredAt,
    });
    if (asset.errors?.length || !asset.data) throw new Error(asset.errors?.[0]?.message ?? 'Asset registration failed');
    await client.models.AssetDetail.create({
      owner: application.data.owner, assetId: asset.data.id, assetType: application.data.assetType,
      schemaVersion: application.data.schemaVersion, answers, completedSections: application.data.completedSections,
      createdAtSnapshot: registeredAt,
    });
    const applicationNumber = reference('EIA');
    const submitted = await client.models.PolicyApplication.update({
      id: application.data.id, applicationNumber, assetId: asset.data.id, status: 'SUBMITTED',
      submittedAt: registeredAt, missingInformation: [], lastUpdatedAt: registeredAt,
    });
    await audit(application.data.id, 'policy_application_submitted', actor, { status: application.data.status }, { status: 'SUBMITTED', assetId: asset.data.id }, correlationId);
    return submitted.data;
  }

  if (['requestUnderwritingInformation', 'reviewPolicyApplication', 'issuePolicyQuote'].includes(event.fieldName)) {
    requireSenior(actor);
    const application = await client.models.PolicyApplication.get({ id: String(args.applicationId) });
    if (!application.data) throw new Error('Application not found');
    if (event.fieldName === 'requestUnderwritingInformation') {
      const missing = (args.missingInformation as string[]).map(String).filter(Boolean);
      if (!missing.length) throw new Error('At least one information request is required');
      const result = await client.models.PolicyApplication.update({ id: application.data.id, status: 'MORE_INFO_REQUIRED', missingInformation: missing, lastUpdatedAt: now() });
      await audit(application.data.id, 'underwriting_information_requested', actor, { status: application.data.status }, { status: 'MORE_INFO_REQUIRED', missing }, correlationId);
      return result.data;
    }
    if (event.fieldName === 'reviewPolicyApplication') {
      const decision = String(args.decision).toUpperCase();
      if (!['UNDER_REVIEW', 'DECLINED'].includes(decision)) throw new Error('Decision must be UNDER_REVIEW or DECLINED');
      if (decision === 'DECLINED') clean(args.reason, 'reason', 5);
      const result = await client.models.PolicyApplication.update({ id: application.data.id, status: decision, lastUpdatedAt: now() });
      if (application.data.assetId) await client.models.Asset.update({ id: application.data.assetId, status: decision === 'DECLINED' ? 'DECLINED' : 'UNDER_REVIEW', lastUpdatedAt: now() });
      await audit(application.data.id, 'policy_application_reviewed', actor, { status: application.data.status }, { status: decision, reason: args.reason }, correlationId);
      return result.data;
    }
    const premium = Number(args.monthlyPremium);
    if (!Number.isFinite(premium) || premium <= 0) throw new Error('A positive monthly premium is required');
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(application.data.status)) throw new Error('Only submitted applications can be quoted');
    const valuation = await listAll(client.models.ApplicationDocument, { filter: { applicationId: { eq: application.data.id }, category: { eq: 'VALUATION' }, status: { eq: 'CLEAN' } } });
    if (!valuation.data.length) throw new Error('The valuation document must pass security scanning before a quote is issued');
    const latest = application.data.latestAssessmentId ? await client.models.PremiumAssessment.get({ id: application.data.latestAssessmentId }) : null;
    if (!latest?.data) throw new Error('An indicative premium assessment is required before quoting');
    const indicative = latest.data.indicativePremium;
    if (Math.abs(premium - indicative) > indicative * 0.1 && !String(args.overrideReason ?? '').trim()) throw new Error('An override reason is required outside the indicative range');
    const result = await client.models.PolicyApplication.update({
      id: application.data.id, status: 'QUOTED', quotedPremium: premium,
      quoteExpiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(), lastUpdatedAt: now(),
    });
    await audit(application.data.id, 'policy_quote_issued', actor, { status: application.data.status }, { status: 'QUOTED', premium, overrideReason: args.overrideReason }, correlationId);
    return result.data;
  }

  if (event.fieldName === 'acceptPolicyQuote') {
    const application = await client.models.PolicyApplication.get({ id: String(args.applicationId) });
    if (!application.data || application.data.owner !== actor.subject) throw new Error('Application not found');
    if (application.data.status !== 'QUOTED' || !application.data.assetId || !application.data.quotedPremium) throw new Error('No active quote is available');
    if (application.data.quoteExpiresAt && application.data.quoteExpiresAt < now()) throw new Error('The quote has expired');
    const acceptedAt = now();
    // Claim the quote first so a double-click or retry cannot create two policies.
    await updateIfStatus('PolicyApplication', APPLICATION_FIELDS, { id: application.data.id, status: 'ACCEPTED', acceptedAt, lastUpdatedAt: acceptedAt }, 'QUOTED');
    const policy = await client.models.Policy.create({
      owner: actor.subject, policyNumber: reference('EIP'),
      valuationType: 'ACTUAL_CASH_VALUE', coverageDetails: 'Comprehensive cover subject to the accepted quote and policy schedule.',
      durationMonths: 12, startDate: acceptedAt, endDate: new Date(Date.now() + 365 * 86400_000).toISOString(),
      status: 'ACTIVE', suggestedPremium: application.data.quotedPremium, approvedPremium: application.data.quotedPremium,
      approvedBy: 'underwriting', approvalTimestamp: acceptedAt,
    });
    if (policy.errors?.length || !policy.data) {
      await client.models.PolicyApplication.update({ id: application.data.id, status: 'QUOTED', acceptedAt: null, lastUpdatedAt: now() });
      throw new Error(policy.errors?.[0]?.message ?? 'Policy activation failed');
    }
    await client.models.Asset.update({ id: application.data.assetId, policyId: policy.data.id, status: 'INSURABLE', lastUpdatedAt: acceptedAt });
    await audit(application.data.id, 'policy_quote_accepted', actor, { status: 'QUOTED' }, { status: 'ACCEPTED', policyId: policy.data.id }, correlationId);
    return policy.data;
  }

  if (event.fieldName === 'ensureUserProfile') {
    const resolved = resolveProfileIdentity({
      claims: event.identity?.claims, email: args.email, displayName: args.displayName, subject: actor.subject,
    });
    const resolvedIsReal = !resolved.email.endsWith('@profile.invalid');
    const existing = await listAll(client.models.UserProfile, { filter: { owner: { eq: actor.subject } } });
    const role = ['client', ...staffGroups].includes(actor.role) ? actor.role : 'client';
    if (existing.data[0]) {
      const current = existing.data[0];
      const storedIsPlaceholder = String(current.email ?? '').endsWith('@profile.invalid')
        || !String(current.displayName ?? '').trim() || current.displayName === current.owner;
      const patch: Record<string, unknown> = {};
      if (current.businessRole !== role) patch.businessRole = role;
      if (current.status !== 'active') patch.status = 'active';
      if (resolvedIsReal && storedIsPlaceholder) { patch.email = resolved.email; patch.displayName = resolved.displayName; }
      if (!Object.keys(patch).length) return current;
      const updated = await client.models.UserProfile.update({ id: current.id, ...patch });
      if (updated.errors?.length || !updated.data) throw new Error(updated.errors?.[0]?.message ?? 'Profile synchronization failed');
      return updated.data;
    }
    const result = await client.models.UserProfile.create({
      owner: actor.subject, email: resolved.email, displayName: resolved.displayName,
      businessRole: role, status: 'active',
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Profile provisioning failed');
    return result.data;
  }

  if (event.fieldName === 'updateMyProfile') {
    const displayName = clean(args.displayName, 'displayName', 2).slice(0, 80);
    const existing = await listAll(client.models.UserProfile, { filter: { owner: { eq: actor.subject } } });
    if (!existing.data[0]) throw new Error('Profile provisioning is still in progress');
    const updated = await client.models.UserProfile.update({ id: existing.data[0].id, displayName });
    if (updated.errors?.length || !updated.data) throw new Error(updated.errors?.[0]?.message ?? 'Profile update failed');
    return updated.data;
  }

  if (event.fieldName === 'registerClaimDocument' || event.fieldName === 'registerApplicationDocument') {
    const forClaim = event.fieldName === 'registerClaimDocument';
    const parentId = clean(forClaim ? args.claimId : args.applicationId, forClaim ? 'claimId' : 'applicationId');
    const objectKey = clean(args.objectKey, 'objectKey');
    const parsed = parseQuarantineKey(objectKey);
    if (!parsed || parsed.kind !== (forClaim ? 'claim' : 'application') || parsed.parentId !== parentId) {
      throw new Error('The upload location does not match this record');
    }
    const mediaType = String(args.mediaType);
    const byteSize = Number(args.byteSize);
    const checksum = String(args.checksum).toLowerCase();
    if (!ALLOWED_MEDIA_TYPES.includes(mediaType)) throw new Error('Documents must be PDF, JPEG or PNG');
    if (!Number.isInteger(byteSize) || byteSize <= 0 || byteSize > MAX_DOCUMENT_BYTES) throw new Error('Documents must be under 10 MB');
    if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error('A SHA-256 checksum is required');
    const category = String(args.category).toUpperCase();
    const fileName = clean(args.fileName, 'fileName').slice(0, 200);
    if (forClaim) {
      if (!['AFFIDAVIT', 'INCIDENT_EVIDENCE', 'IDENTITY', 'VALUATION', 'CORRESPONDENCE', 'OTHER'].includes(category)) throw new Error('Unsupported document category');
      const claim = await getClaim(parentId);
      if (claim.owner !== actor.subject) throw new Error('Claim not found');
      if (!['DRAFT', 'ASSIGNMENT_PENDING', 'VALIDATING', 'INFO_NEEDED', 'UNDER_ASSESSMENT'].includes(claim.status)) throw new Error('Documents can no longer be added to this claim');
      const prior = await listAll(client.models.ClaimDocument, { filter: { objectKey: { eq: objectKey }, owner: { eq: actor.subject } } });
      if (prior.data[0]) return prior.data[0];
      const result = await client.models.ClaimDocument.create({
        owner: actor.subject, claimId: parentId, objectKey, fileName, mediaType, byteSize, checksum,
        status: 'QUARANTINED', uploadedBy: actor.subject, category, visibility: 'CLIENT_VISIBLE',
      });
      if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Document registration failed');
      await audit(parentId, 'document_registered', actor, null, { documentId: result.data.id, category }, correlationId);
      return result.data;
    }
    if (category !== 'VALUATION') throw new Error('Unsupported document category');
    const application = await client.models.PolicyApplication.get({ id: parentId });
    if (!application.data || application.data.owner !== actor.subject) throw new Error('Application not found');
    if (!['DRAFT', 'MORE_INFO_REQUIRED'].includes(application.data.status)) throw new Error('This application is read-only');
    const prior = await listAll(client.models.ApplicationDocument, { filter: { objectKey: { eq: objectKey }, owner: { eq: actor.subject } } });
    if (prior.data[0]) return prior.data[0];
    const result = await client.models.ApplicationDocument.create({
      owner: actor.subject, applicationId: parentId, category, objectKey, fileName, mediaType, byteSize, checksum,
      status: 'QUARANTINED', uploadedAt: now(),
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Document registration failed');
    return result.data;
  }

  if (event.fieldName === 'getAssignedCasePortfolio') {
    requireStaff(actor);
    if (isDeveloper(actor) && !isSenior(actor)) {
      // Diagnostics only: workflow state without client narrative, documents or messages (POPIA minimisation).
      const claims = await listAll(client.models.Claim, {});
      const diagnostics = claims.data.map((claim: any) => ({
        id: claim.id, claimNumber: claim.claimNumber, status: claim.status, currentMilestone: claim.currentMilestone,
        tier: claim.tier, assignedOfficerId: claim.assignedOfficerId, submittedAt: claim.submittedAt,
        lastActivityAt: claim.lastActivityAt, assignmentDueAt: claim.assignmentDueAt, createdAt: claim.createdAt,
        owner: 'redacted', policyId: claim.policyId, assetId: claim.assetId, claimType: claim.claimType,
        description: 'Redacted for diagnostics', incidentDate: claim.incidentDate,
      }));
      return { claims: diagnostics, assignments: [], activities: [], communications: [], documents: [], internalNotes: [], assets: [], policies: [], claimAssessments: [] };
    }
    if (isSenior(actor)) {
      const [claims, assignments, activities, communications, documents, notes, assets, policies, assessments] = await Promise.all([
        listAll(client.models.Claim, {}), listAll(client.models.ClaimAssignment, {}), listAll(client.models.ClaimActivity, {}),
        listAll(client.models.ClaimCommunication, {}), listAll(client.models.ClaimDocument, {}), listAll(client.models.ClaimInternalNote, {}),
        listAll(client.models.Asset, {}), listAll(client.models.Policy, {}), listAll(client.models.ClaimAssessment, {}),
      ]);
      return { claims: claims.data, assignments: assignments.data, activities: activities.data, communications: communications.data, documents: documents.data, internalNotes: notes.data, assets: assets.data, policies: policies.data, claimAssessments: assessments.data };
    }
    const assignmentResult = await listAll(client.models.ClaimAssignment, {
      filter: { userSubject: { eq: actor.subject }, active: { eq: true } },
    });
    const claimIds = [...new Set(assignmentResult.data.map((item: any) => item.claimId))] as string[];
    const bundles = await Promise.all(claimIds.map(async (claimId) => {
      const [claim, activities, communications, documents, notes, team, assessments] = await Promise.all([
        client.models.Claim.get({ id: claimId }),
        listAll(client.models.ClaimActivity, { filter: { claimId: { eq: claimId } } }),
        listAll(client.models.ClaimCommunication, { filter: { claimId: { eq: claimId } } }),
        listAll(client.models.ClaimDocument, { filter: { claimId: { eq: claimId } } }),
        listAll(client.models.ClaimInternalNote, { filter: { claimId: { eq: claimId } } }),
        listAll(client.models.ClaimAssignment, { filter: { claimId: { eq: claimId } } }),
        listAll(client.models.ClaimAssessment, { filter: { claimId: { eq: claimId } } }),
      ]);
      const [asset, policy] = claim.data ? await Promise.all([
        client.models.Asset.get({ id: claim.data.assetId }), client.models.Policy.get({ id: claim.data.policyId }),
      ]) : [{ data: null }, { data: null }];
      return { claim: claim.data, activities: activities.data, communications: communications.data, documents: documents.data, notes: notes.data, team: team.data, assessments: assessments.data, asset: asset.data, policy: policy.data };
    }));
    return {
      claims: bundles.map((item) => item.claim).filter(Boolean),
      assignments: bundles.flatMap((item) => item.team),
      activities: bundles.flatMap((item) => item.activities),
      communications: bundles.flatMap((item) => item.communications),
      documents: bundles.flatMap((item) => item.documents),
      internalNotes: bundles.flatMap((item) => item.notes),
      claimAssessments: bundles.flatMap((item) => item.assessments),
      assets: [...new Map(bundles.filter((item) => item.asset).map((item) => [item.asset.id, item.asset])).values()],
      policies: [...new Map(bundles.filter((item) => item.policy).map((item) => [item.policy.id, item.policy])).values()],
    };
  }

  if (event.fieldName === 'createClaimDraft') {
    const key = clean(args.idempotencyKey, 'idempotencyKey');
    const existing = await listAll(client.models.Claim, { filter: { idempotencyKey: { eq: key }, owner: { eq: actor.subject } } });
    if (existing.data[0]) return existing.data[0];
    const [asset, policy] = await Promise.all([
      client.models.Asset.get({ id: String(args.assetId) }), client.models.Policy.get({ id: String(args.policyId) }),
    ]);
    if (!asset.data || !policy.data || asset.data.owner !== actor.subject || policy.data.owner !== actor.subject) {
      throw new Error('The selected asset and policy must belong to the authenticated client');
    }
    if (asset.data.policyId !== policy.data.id) throw new Error('The asset is not linked to the selected policy');
    const createdAt = now();
    const result = await client.models.Claim.create({
      owner: actor.subject, policeCaseNumber: clean(args.policeCaseNumber, 'policeCaseNumber', 3),
      policyId: policy.data.id, assetId: asset.data.id, claimType: clean(args.claimType, 'claimType'),
      description: clean(args.description, 'description', 10), incidentDate: String(args.incidentDate),
      incidentLocation: args.incidentLocation ? String(args.incidentLocation) : undefined,
      status: 'DRAFT', currentMilestone: 'DRAFT',
      lastActivityAt: createdAt, idempotencyKey: key,
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Claim draft creation failed');
    await activity(result.data, 'DRAFT_CREATED', 'DRAFT', 'Your claim draft was created.', actor, correlationId);
    return result.data;
  }

  if (event.fieldName === 'requestAccountClosure') {
    const key = clean(args.idempotencyKey, 'idempotencyKey');
    const existing = await listAll(client.models.AccountClosureRequest, { filter: { correlationId: { eq: key }, owner: { eq: actor.subject } } });
    if (existing.data[0]) return existing.data[0];
    const requestedAt = now();
    const result = await client.models.AccountClosureRequest.create({
      owner: actor.subject, requestedAt, status: 'READY_FOR_IDENTITY_DELETION',
      retentionPolicyVersion: 'ACTIVE-ACCOUNT-LIFETIME-v1', correlationId: key,
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Account closure request failed');
    const profiles = await listAll(client.models.UserProfile, { filter: { owner: { eq: actor.subject } } });
    const suffix = createHash('sha256').update(actor.subject).digest('hex').slice(0, 16);
    await Promise.all(profiles.data.map((profile: any) => client.models.UserProfile.update({
      id: profile.id, displayName: 'Former client', email: `closed+${suffix}@redacted.invalid`, status: 'disabled',
    })));
    const claims = await listAll(client.models.Claim, { filter: { owner: { eq: actor.subject } } });
    await Promise.all(claims.data.map(async (claim: any) => {
      const [activities, communications, calls] = await Promise.all([
        listAll(client.models.ClaimActivity, { filter: { claimId: { eq: claim.id } } }),
        listAll(client.models.ClaimCommunication, { filter: { claimId: { eq: claim.id } } }),
        listAll(client.models.CallRecord, { filter: { claimId: { eq: claim.id } } }),
      ]);
      await Promise.all([
        ...activities.data.filter((item: any) => item.actorSubject === actor.subject).map((item: any) =>
          client.models.ClaimActivity.update({ id: item.id, actorDisplayNameSnapshot: 'Former client' })),
        ...communications.data.map((item: any) => client.models.ClaimCommunication.update({
          id: item.id,
          senderDisplayNameSnapshot: item.senderSubject === actor.subject ? 'Former client' : item.senderDisplayNameSnapshot,
          recipientSnapshots: item.recipientSnapshots.map((recipient: string) =>
            /@|\+?\d[\d\s-]{7,}/.test(recipient) ? 'redacted' : recipient),
        })),
        ...calls.data.map((item: any) => client.models.CallRecord.update({
          id: item.id, participantSnapshots: item.participantSnapshots.map(() => 'redacted participant'),
        })),
      ]);
    }));
    const anonymisedAt = now();
    await client.models.AccountClosureRequest.update({ id: result.data.id, status: 'ANONYMISED', anonymisedAt });
    return { ...result.data, status: 'ANONYMISED', anonymisedAt };
  }

  if (event.fieldName === 'submitClaimDraft') {
    const claim = await getClaim(String(args.claimId));
    if (claim.owner !== actor.subject) throw new Error('Only the owner can submit this draft');
    if (claim.status !== 'DRAFT' && claim.claimNumber) return claim;
    if (claim.status !== 'DRAFT') throw new Error('The claim cannot be submitted from its current state');
    const documents = await listAll(client.models.ClaimDocument, { filter: { claimId: { eq: claim.id }, category: { eq: 'AFFIDAVIT' } } });
    const prerequisites = validateDraftPrerequisites(claim.policeCaseNumber, documents.data);
    if (!prerequisites.valid) throw new Error(prerequisites.reason ?? 'Claim draft is incomplete');
    const submittedAt = now();
    const claimNumber = reference('EIC');
    const result = await client.models.Claim.update({
      id: claim.id, claimNumber, status: 'ASSIGNMENT_PENDING', currentMilestone: 'ASSIGNMENT_PENDING',
      submittedAt, lastActivityAt: submittedAt, assignmentDueAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Claim submission failed');
    await activity(result.data, 'CLAIM_SUBMITTED', 'ASSIGNMENT_PENDING', `Claim ${claimNumber} was received. Advisor assignment is in progress.`, actor, correlationId);
    await audit(claim.id, 'submitted', actor, { status: 'DRAFT' }, { status: 'ASSIGNMENT_PENDING', claimNumber }, correlationId);
    await autoAssignLead(result.data, actor, correlationId);
    return (await getClaim(claim.id));
  }

  // Compatibility bridge: direct submission now creates a draft but cannot bypass the mandatory affidavit.
  if (event.fieldName === 'submitClaim') throw new Error('Use createClaimDraft, upload an affidavit, then submitClaimDraft');

  if (event.fieldName === 'addClaimInternalNote') {
    requireCaseOfficer(actor);
    const claim = await getClaim(String(args.claimId));
    if (!(await canAccessClaim(actor, claim))) throw new Error('Claim assignment access required');
    const duplicate = await listAll(client.models.ClaimInternalNote, { filter: { correlationId: { eq: String(args.idempotencyKey) } } });
    if (duplicate.data[0]) return duplicate.data[0];
    const result = await client.models.ClaimInternalNote.create({
      claimId: claim.id, authorSubject: actor.subject, authorDisplayNameSnapshot: actor.displayName,
      authorRoleSnapshot: actor.role, body: clean(args.body, 'body', 2), occurredAt: now(),
      correlationId: String(args.idempotencyKey),
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Internal note failed');
    return result.data;
  }

  if (event.fieldName === 'sendClaimCommunication') {
    const claim = await getClaim(String(args.claimId));
    if (!(await canAccessClaim(actor, claim))) throw new Error('Claim access denied');
    if (claim.status === 'CLOSED') throw new Error('Closed claims are read-only');
    if (String(args.visibility) !== 'CLIENT_VISIBLE') throw new Error('Private notes must use addClaimInternalNote');
    const channel = String(args.channel).toUpperCase();
    if (!['PORTAL', 'EMAIL', 'SMS', 'WHATSAPP'].includes(channel)) throw new Error('Unsupported communication channel');
    if (!isStaff(actor) && channel !== 'PORTAL') throw new Error('Clients reply through the secure portal');
    const key = clean(args.idempotencyKey, 'idempotencyKey');
    const existing = await listAll(client.models.ClaimCommunication, { filter: { idempotencyKey: { eq: key }, senderSubject: { eq: actor.subject } } });
    if (existing.data[0]) return existing.data[0];
    const occurredAt = now();
    const result = await client.models.ClaimCommunication.create({
      owner: claim.owner, claimId: claim.id, channel, direction: isStaff(actor) ? 'OUTBOUND' : 'INBOUND',
      subject: args.subject ? String(args.subject) : undefined, body: clean(args.body, 'body', 2),
      senderSubject: actor.subject, senderDisplayNameSnapshot: actor.displayName, senderRoleSnapshot: actor.role,
      recipientSnapshots: (args.recipients as string[]) ?? [], visibility: 'CLIENT_VISIBLE',
      provider: channel === 'PORTAL' ? 'IN_APP' : 'CONFIGURABLE_ADAPTER',
      deliveryState: channel === 'PORTAL' ? 'DELIVERED' : 'QUEUED',
      sentAt: channel === 'PORTAL' ? occurredAt : undefined, deliveredAt: channel === 'PORTAL' ? occurredAt : undefined,
      occurredAt, idempotencyKey: key, correlationId,
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Communication failed');
    await activity(claim, 'COMMUNICATION_ADDED', claim.currentMilestone ?? claim.status, `${actor.displayName} added a case update.`, actor, correlationId);
    await enqueueCommunication(result.data.id, claim.id, channel, correlationId);
    return result.data;
  }

  if (event.fieldName === 'requestClaimInformation') {
    requireCaseOfficer(actor);
    const claim = await getClaim(String(args.claimId));
    if (!(await canAccessClaim(actor, claim))) throw new Error('Claim assignment access required');
    if (!['VALIDATING', 'UNDER_ASSESSMENT'].includes(claim.status)) throw new Error('Information cannot be requested from the current state');
    const request = clean(args.request, 'request', 5); const changedAt = now();
    const result = await client.models.Claim.update({
      id: claim.id, status: 'INFO_NEEDED', currentMilestone: 'INFO_NEEDED', lastActivityAt: changedAt,
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Information request failed');
    await activity(result.data, 'INFORMATION_REQUESTED', 'INFO_NEEDED', 'Your advisor needs more information.', actor, correlationId, request);
    await audit(claim.id, 'information_requested', actor, { status: claim.status }, { status: 'INFO_NEEDED', request }, correlationId);
    return result.data;
  }

  if (event.fieldName === 'provideClaimInformation') {
    const claim = await getClaim(String(args.claimId));
    if (claim.owner !== actor.subject) throw new Error('Only the claim owner can provide requested information');
    if (claim.status !== 'INFO_NEEDED') throw new Error('The claim is not waiting for information');
    const response = clean(args.response, 'response', 2); const changedAt = now();
    const communication = await client.models.ClaimCommunication.create({
      owner: claim.owner, claimId: claim.id, channel: 'PORTAL', direction: 'INBOUND',
      body: response, senderSubject: actor.subject, senderDisplayNameSnapshot: actor.displayName,
      senderRoleSnapshot: actor.role, recipientSnapshots: [claim.assignedOfficerId ?? 'case-team'],
      visibility: 'CLIENT_VISIBLE', provider: 'IN_APP', deliveryState: 'DELIVERED',
      sentAt: changedAt, deliveredAt: changedAt, occurredAt: changedAt,
      idempotencyKey: String(args.idempotencyKey), correlationId,
    });
    if (communication.errors?.length) throw new Error(communication.errors[0].message);
    const result = await client.models.Claim.update({
      id: claim.id, status: 'UNDER_ASSESSMENT', currentMilestone: 'UNDER_ASSESSMENT', lastActivityAt: changedAt,
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Information response failed');
    await activity(result.data, 'INFORMATION_PROVIDED', 'UNDER_ASSESSMENT', 'Requested information was provided and assessment resumed.', actor, correlationId);
    await audit(claim.id, 'information_provided', actor, { status: 'INFO_NEEDED' }, { status: 'UNDER_ASSESSMENT' }, correlationId);
    return result.data;
  }

  if (event.fieldName === 'logClaimCall') {
    requireCaseOfficer(actor);
    const claim = await getClaim(String(args.claimId));
    if (!(await canAccessClaim(actor, claim))) throw new Error('Claim assignment access required');
    const result = await client.models.CallRecord.create({
      claimId: claim.id, direction: String(args.direction), participantSnapshots: args.participants as string[],
      startedAt: String(args.startedAt), endedAt: args.endedAt ? String(args.endedAt) : undefined,
      consentStatus: clean(args.consentStatus, 'consentStatus'), outcome: clean(args.outcome, 'outcome', 2),
      advisorNotes: args.advisorNotes ? String(args.advisorNotes) : undefined,
      transcriptKey: args.transcriptKey ? String(args.transcriptKey) : undefined,
      recordingKey: args.recordingKey ? String(args.recordingKey) : undefined,
      loggedBySubject: actor.subject, loggedByDisplayNameSnapshot: actor.displayName, correlationId,
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Call log failed');
    await activity(claim, 'PHONE_CALL_LOGGED', claim.currentMilestone ?? claim.status, `A phone call was logged: ${String(args.outcome)}`, actor, correlationId);
    return result.data;
  }

  if (event.fieldName === 'assignClaimTeamMember') {
    requireSenior(actor);
    const claim = await getClaim(String(args.claimId));
    const userSubject = clean(args.userSubject, 'userSubject');
    const profiles = await listAll(client.models.UserProfile, { filter: { owner: { eq: userSubject } } });
    const profile = profiles.data.find((item: any) => item.status === 'active' && item.businessRole !== 'client');
    if (!profile) throw new Error('The selected case-team member is not an active officer');
    const key = clean(args.idempotencyKey, 'idempotencyKey');
    const prior = await listAll(client.models.ClaimAssignment, { filter: { correlationId: { eq: key } } });
    if (prior.data[0]) return prior.data[0];
    if (args.isLead) {
      const active = await listAll(client.models.ClaimAssignment, { filter: { claimId: { eq: claim.id }, isLead: { eq: true }, active: { eq: true } } });
      await Promise.all(active.data.map((item: any) => client.models.ClaimAssignment.update({
        id: item.id, active: false, endedAt: now(), endedBy: actor.subject,
      })));
    }
    const assignedAt = now();
    const result = await client.models.ClaimAssignment.create({
      claimId: claim.id, claimOwner: claim.owner, userSubject,
      userDisplayNameSnapshot: profile.displayName ?? profile.email, userRoleSnapshot: profile.businessRole,
      assignmentRole: String(args.assignmentRole), isLead: Boolean(args.isLead), active: true, assignedAt,
      assignedBy: actor.subject, correlationId: key,
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Assignment failed');
    if (args.isLead) await client.models.Claim.update({ id: claim.id, assignedOfficerId: userSubject, status: claim.status === 'ASSIGNMENT_PENDING' ? 'VALIDATING' : claim.status });
    await activity(claim, 'TEAM_MEMBER_ASSIGNED', claim.currentMilestone ?? claim.status, `${profile.displayName ?? profile.email} joined the case team as ${String(args.assignmentRole).toLowerCase().replaceAll('_', ' ')}.`, actor, correlationId);
    return result.data;
  }

  if (event.fieldName === 'endClaimAssignment') {
    requireSenior(actor);
    const assignment = await client.models.ClaimAssignment.get({ id: String(args.assignmentId) });
    if (!assignment.data) throw new Error('Assignment not found');
    if (assignment.data.isLead && assignment.data.active) {
      throw new Error('Assign a replacement lead advisor before ending the current lead assignment');
    }
    const result = await client.models.ClaimAssignment.update({ id: assignment.data.id, active: false, endedAt: now(), endedBy: actor.subject });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Assignment close failed');
    const claim = await getClaim(assignment.data.claimId);
    await activity(claim, 'TEAM_MEMBER_REMOVED', claim.currentMilestone ?? claim.status, `${assignment.data.userDisplayNameSnapshot} left the active case team.`, actor, correlationId);
    return result.data;
  }

  if (event.fieldName === 'transitionClaim' || event.fieldName === 'closeClaim') {
    requireCaseOfficer(actor);
    if (event.fieldName === 'closeClaim') requireSenior(actor);
    const claim = await getClaim(String(args.claimId));
    if (!(await canAccessClaim(actor, claim))) throw new Error('Claim assignment access required');
    const target = event.fieldName === 'closeClaim' ? 'CLOSED' : String(args.targetStatus);
    if (!canManuallyTransition(claim.status, target)) throw new Error(`Claim cannot move from ${claim.status} to ${target}`);
    if (target === 'PAYMENT_PENDING') requireSenior(actor);
    const changedAt = now();
    const updated = await updateIfStatus('Claim', CLAIM_FIELDS, {
      id: claim.id, status: target, currentMilestone: target, lastActivityAt: changedAt,
      ...(target === 'CLOSED' ? { closedAt: changedAt } : {}),
    }, claim.status);
    const result = { data: updated };
    await activity(result.data, 'STATUS_CHANGED', target, clean(args.summary, 'summary', 2), actor, correlationId, args.detail ? String(args.detail) : undefined);
    await audit(claim.id, 'status_changed', actor, { status: claim.status }, { status: target }, correlationId);
    return result.data;
  }

  if (event.fieldName === 'calculateClaimPayoutAssessment') {
    requireCaseOfficer(actor);
    const assessmentClaim = await getClaim(String(args.claimId));
    if (!(await canAccessClaim(actor, assessmentClaim))) throw new Error('Claim assignment access required');
    if (assessmentClaim.status !== 'UNDER_ASSESSMENT') throw new Error('Claim must be under assessment');
    const cleanEvidence = await listAll(client.models.ClaimDocument, { filter: { claimId: { eq: assessmentClaim.id }, status: { eq: 'CLEAN' } } });
    const reviewed = (args.evidenceReviewed as string[]).map(String);
    if (!reviewed.length || reviewed.some((id) => !cleanEvidence.data.some((document: any) => document.id === id))) throw new Error('Only clean claim evidence can support an assessment');
    const number = (name: string, optional = false) => {
      if (optional && (args[name] === undefined || args[name] === null)) return undefined;
      const value = Number(args[name]); if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative`); return value;
    };
    const depreciation = number('depreciation')!;
    if (depreciation > 1) throw new Error('depreciation cannot exceed 1');
    const input = {
      coveredLossValue: number('coveredLossValue')!, repairEstimate: number('repairEstimate', true),
      replacementEstimate: number('replacementEstimate', true), policyLimit: number('policyLimit')!,
      excess: number('excess')!, depreciation,
    };
    const key = String(args.idempotencyKey);
    const prior = await listAll(client.models.ClaimAssessment, { filter: { idempotencyKey: { eq: key } } });
    if (prior.data[0]) return prior.data[0];
    const history = await listAll(client.models.ClaimAssessment, { filter: { claimId: { eq: assessmentClaim.id } } });
    const recommendedPayout = calculateRecommendedPayout(input);
    const result = await client.models.ClaimAssessment.create({
      claimId: assessmentClaim.id, claimOwner: assessmentClaim.owner, version: history.data.length + 1,
      evidenceReviewed: reviewed, ...input, exclusions: (args.exclusions as string[]).map(String),
      recommendedPayout, calculationVersion: 'claim-payout-2026-01', status: 'DRAFT',
      assessorSubject: actor.subject, assessorDisplayNameSnapshot: actor.displayName, assessorRoleSnapshot: actor.role,
      createdAtSnapshot: now(), idempotencyKey: key, correlationId,
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Assessment creation failed');
    await audit(assessmentClaim.id, 'claim_assessment_created', actor, null, { assessmentId: result.data.id, recommendedPayout }, correlationId);
    return result.data;
  }

  if (event.fieldName === 'finalizeClaimPayoutAssessment') {
    requireSenior(actor);
    const assessment = await client.models.ClaimAssessment.get({ id: String(args.assessmentId) });
    if (!assessment.data) throw new Error('Assessment not found');
    if (assessment.data.status !== 'DRAFT') throw new Error('This assessment has already been finalized');
    const claimBeforeFinalize = await getClaim(assessment.data.claimId);
    if (claimBeforeFinalize.status !== 'UNDER_ASSESSMENT') throw new Error('Claim must be under assessment');
    if (claimBeforeFinalize.owner === actor.subject) throw new Error('You cannot finalize an assessment on your own claim');
    const override = args.overridePayout === undefined || args.overridePayout === null ? undefined : Number(args.overridePayout);
    if (override !== undefined && (!Number.isFinite(override) || override < 0)) throw new Error('overridePayout must be non-negative');
    if (override !== undefined && override !== assessment.data.recommendedPayout && !String(args.overrideReason ?? '').trim()) throw new Error('An override reason is required');
    const payout = override ?? assessment.data.recommendedPayout;
    if (payout > assessment.data.policyLimit) throw new Error('The payout cannot exceed the policy limit');
    const finalized = await updateIfStatus('ClaimAssessment', ASSESSMENT_FIELDS, {
      id: assessment.data.id, recommendedPayout: payout, overrideReason: args.overrideReason ? String(args.overrideReason) : undefined,
      status: 'FINALIZED', finalizedAt: now(), finalizedBySubject: actor.subject,
    }, 'DRAFT');
    const result = { data: finalized };
    await updateIfStatus('Claim', CLAIM_FIELDS, { id: assessment.data.claimId, suggestedPayout: payout, status: 'DECISION_PENDING', currentMilestone: 'DECISION_PENDING', lastActivityAt: now() }, 'UNDER_ASSESSMENT');
    const assessmentClaim = await getClaim(assessment.data.claimId);
    await activity(assessmentClaim, 'ASSESSMENT_COMPLETED', 'DECISION_PENDING', 'Evidence review is complete and the payout recommendation awaits a human decision.', actor, correlationId);
    await audit(assessment.data.claimId, 'claim_assessment_finalized', actor, { recommendedPayout: assessment.data.recommendedPayout }, { payout, overrideReason: args.overrideReason }, correlationId);
    return result.data;
  }

  const claimId = String(args.claimId);
  const claim = await getClaim(claimId);

  if (event.fieldName === 'startClaimProcessing') {
    requireCaseOfficer(actor);
    if (!(await canAccessClaim(actor, claim))) throw new Error('Claim assignment access required');
    if (claim.status !== 'VALIDATING' && claim.status !== 'FAILED') throw new Error('Claim cannot be started from its current state');
    const key = String(args.idempotencyKey);
    const prior = await listAll(client.models.ProcessingJob, { filter: { correlationId: { eq: key } } });
    if (prior.data[0]) return prior.data[0];
    const affidavit = await listAll(client.models.ClaimDocument, { filter: { claimId: { eq: claim.id }, category: { eq: 'AFFIDAVIT' }, status: { eq: 'CLEAN' } } });
    if (!affidavit.data.length) throw new Error('The police affidavit must pass security scanning before assessment');
    const job = await client.models.ProcessingJob.create({ claimId, status: 'QUEUED', currentStep: 'queued', attempts: 0, correlationId: key });
    if (job.errors?.length || !job.data) throw new Error(job.errors?.[0]?.message ?? 'Job creation failed');
    const stateMachineArn = process.env.CLAIMS_STATE_MACHINE_ARN;
    if (!stateMachineArn) throw new Error('Claims workflow is not configured');
    await updateIfStatus('Claim', CLAIM_FIELDS, { id: claimId, status: 'UNDER_ASSESSMENT', currentMilestone: 'UNDER_ASSESSMENT' }, claim.status);
    let execution;
    try {
      execution = await stepFunctions.send(new StartExecutionCommand({
        stateMachineArn, name: `claim-${claimId}-${key}`.replace(/[^A-Za-z0-9-_]/g, '').slice(0, 80),
        input: JSON.stringify({ claimId, jobId: job.data.id, correlationId }),
      }));
    } catch (error) {
      // Don't leave the claim stranded in UNDER_ASSESSMENT with no workflow behind it.
      await client.models.Claim.update({ id: claimId, status: claim.status, currentMilestone: claim.currentMilestone ?? claim.status });
      await client.models.ProcessingJob.update({ id: job.data.id, status: 'FAILED', currentStep: 'start', errorCategory: 'START_EXECUTION', errorMessage: String(error).slice(0, 500) });
      throw new Error('The assessment workflow could not be started. Please try again.', { cause: error });
    }
    await client.models.ProcessingJob.update({ id: job.data.id, executionArn: execution.executionArn });
    await activity(claim, 'ASSESSMENT_STARTED', 'UNDER_ASSESSMENT', 'Your claim assessment has started.', actor, correlationId);
    await audit(claimId, 'processing_started', actor, { status: claim.status }, { status: 'UNDER_ASSESSMENT', jobId: job.data.id }, correlationId);
    return { ...job.data, executionArn: execution.executionArn };
  }

  if (event.fieldName === 'approveClaim' || event.fieldName === 'rejectClaim') {
    requireSenior(actor);
    const approved = event.fieldName === 'approveClaim';
    const target = approved ? 'APPROVED' : 'REJECTED';
    // A retried request from the same officer returns the decision already made.
    if (claim.status === target && claim.approvedBy === actor.subject) return claim;
    if (claim.status !== 'DECISION_PENDING') throw new Error('Only claims awaiting a decision can be approved or rejected');
    const payout = approved ? Number(args.approvedPayout) : 0;
    if (!Number.isFinite(payout) || payout < 0) throw new Error('approvedPayout must be non-negative');
    if (approved && payout !== claim.suggestedPayout && !String(args.overrideReason ?? '').trim()) throw new Error('An override reason is required when changing the assessed payout');
    const reason = approved ? undefined : clean(args.reason, 'reason', 5);
    const assessments = await listAll(client.models.ClaimAssessment, { filter: { claimId: { eq: claim.id }, status: { eq: 'FINALIZED' } } });
    const assessment = assessments.data.sort((left: any, right: any) => right.version - left.version)[0];
    assertDecisionAuthority({ actorSubject: actor.subject, actorGroups: actor.groups, claimOwner: claim.owner, payout, assessment });
    const decidedAt = now();
    const updated = await updateIfStatus('Claim', CLAIM_FIELDS, {
      id: claim.id, status: target, currentMilestone: target, approvedPayout: payout,
      approvedBy: actor.subject, approvalTimestamp: decidedAt, lastActivityAt: decidedAt,
    }, 'DECISION_PENDING');
    const result = { data: updated };
    await activity(result.data, approved ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED', target, approved ? 'Your claim was approved.' : `Your claim was not approved: ${reason}`, actor, correlationId);
    await audit(claim.id, approved ? 'approved' : 'rejected', actor, { status: claim.status }, { status: target, approvedPayout: payout, reason, overrideReason: args.overrideReason, assessmentId: assessment.id, idempotencyKey: args.idempotencyKey }, correlationId);
    return result.data;
  }

  // Explicit, audited payment confirmation replaces the free "mark as paid" transition.
  // Until a payment rail is integrated this records the bank/EFT reference supplied by finance.
  if (event.fieldName === 'recordClaimPayout') {
    requireSenior(actor);
    if (claim.status === 'PAID') return claim;
    if (claim.status !== 'PAYMENT_PENDING') throw new Error('Only claims awaiting payment can be marked as paid');
    if (claim.owner === actor.subject) throw new Error('You cannot confirm payment on your own claim');
    const paymentReference = clean(args.paymentReference, 'paymentReference', 4);
    const paidAmount = Number(args.paidAmount);
    if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - Number(claim.approvedPayout ?? -1)) > 0.005) {
      throw new Error('The paid amount must equal the approved payout');
    }
    const paidAt = now();
    const updated = await updateIfStatus('Claim', CLAIM_FIELDS, {
      id: claim.id, status: 'PAID', currentMilestone: 'PAID', lastActivityAt: paidAt,
    }, 'PAYMENT_PENDING');
    await activity(updated, 'PAYOUT_CONFIRMED', 'PAID', 'Your payout has been paid.', actor, correlationId);
    await audit(claim.id, 'payout_confirmed', actor, { status: 'PAYMENT_PENDING' }, { status: 'PAID', paidAmount, paymentReference }, correlationId);
    return updated;
  }

  if (event.fieldName === 'assignOfficer') {
    requireSenior(actor);
    throw new Error('Use assignClaimTeamMember so assignment history and identity snapshots are preserved');
  }

  throw new Error('Unsupported claim command');
};
