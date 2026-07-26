import { createHash, randomUUID } from 'node:crypto';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { canTransition, validateDraftPrerequisites } from './domain';
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
  const assignments = await client.models.ClaimAssignment.list({
    filter: { claimId: { eq: claim.id }, userSubject: { eq: actor.subject }, active: { eq: true } },
  });
  return assignments.data.length > 0;
}

async function autoAssignLead(claim: any, actor: Actor, correlationId: string) {
  const profiles = await client.models.UserProfile.list({ filter: { status: { eq: 'active' } } });
  const eligible = profiles.data.filter((profile: any) =>
    ['junior_officer', 'intermediate_officer', 'senior_officer'].includes(profile.businessRole));
  if (!eligible.length) return null;
  const loads = await Promise.all(eligible.map(async (profile: any) => {
    const assignments = await client.models.ClaimAssignment.list({
      filter: { userSubject: { eq: profile.owner }, active: { eq: true } },
    });
    return { profile, load: assignments.data.length };
  }));
  loads.sort((left, right) => left.load - right.load || String(left.profile.owner).localeCompare(String(right.profile.owner)));
  const selected = loads[0].profile;
  const assignedAt = now();
  const result = await client.models.ClaimAssignment.create({
    claimId: claim.id, claimOwner: claim.owner, userSubject: selected.owner,
    userDisplayNameSnapshot: selected.displayName ?? selected.email,
    userRoleSnapshot: selected.businessRole, assignmentRole: 'LEAD_ADVISOR', isLead: true,
    active: true, assignedAt, assignedBy: actor.subject, correlationId,
  });
  if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Advisor assignment failed');
  await client.models.Claim.update({
    id: claim.id, assignedOfficerId: selected.owner, status: 'VALIDATING',
    currentMilestone: 'VALIDATING', lastActivityAt: assignedAt,
  });
  await activity(claim, 'ADVISOR_ASSIGNED', 'VALIDATING', `${selected.displayName ?? 'An advisor'} is now leading your claim.`, {
    subject: selected.owner, groups: [selected.businessRole], displayName: selected.displayName ?? selected.email, email: selected.email, role: selected.businessRole,
  }, correlationId);
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
    const result = await client.models.Asset.list({});
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
    const prior = await client.models.PolicyApplication.list({ filter: { idempotencyKey: { eq: key } } });
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
    const merged = { ...(application.data.answers as Record<string, unknown>), ...(args.answers as Record<string, unknown>) };
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
      const documents = await client.models.ApplicationDocument.list({ filter: { applicationId: { eq: application.data.id } } });
      if (!documents.data.some((document: any) => document.category === 'VALUATION' && ['QUARANTINED', 'SCANNING', 'CLEAN', 'EXTRACTED'].includes(document.status))) {
        missing.push('Purchase invoice or valuation document');
      }
    }
    if (missing.length) {
      await client.models.PolicyApplication.update({ id: application.data.id, missingInformation: missing, status: 'MORE_INFO_REQUIRED', lastUpdatedAt: now() });
      throw new Error(`Complete these fields: ${missing.join(', ')}`);
    }
    const key = String(args.idempotencyKey);
    const existingAssessment = await client.models.PremiumAssessment.list({ filter: { idempotencyKey: { eq: key } } });
    let assessment = existingAssessment.data[0];
    if (!assessment) {
      const profileHistory = await client.models.UnderwritingProfile.list({ filter: { owner: { eq: application.data.owner } } });
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
    const applicationNumber = `EIA-${new Date().getUTCFullYear()}-${Date.now().toString().slice(-8)}`;
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
    const latest = application.data.latestAssessmentId ? await client.models.PremiumAssessment.get({ id: application.data.latestAssessmentId }) : null;
    const indicative = latest?.data?.indicativePremium ?? premium;
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
    const policy = await client.models.Policy.create({
      owner: actor.subject, policyNumber: `EIP-${new Date().getUTCFullYear()}-${Date.now().toString().slice(-8)}`,
      valuationType: 'ACTUAL_CASH_VALUE', coverageDetails: 'Comprehensive cover subject to the accepted quote and policy schedule.',
      durationMonths: 12, startDate: acceptedAt, endDate: new Date(Date.now() + 365 * 86400_000).toISOString(),
      status: 'ACTIVE', suggestedPremium: application.data.quotedPremium, approvedPremium: application.data.quotedPremium,
      approvedBy: 'underwriting', approvalTimestamp: acceptedAt,
    });
    if (policy.errors?.length || !policy.data) throw new Error(policy.errors?.[0]?.message ?? 'Policy activation failed');
    await client.models.Asset.update({ id: application.data.assetId, policyId: policy.data.id, status: 'INSURABLE', lastUpdatedAt: acceptedAt });
    await client.models.PolicyApplication.update({ id: application.data.id, status: 'ACCEPTED', acceptedAt, lastUpdatedAt: acceptedAt });
    await audit(application.data.id, 'policy_quote_accepted', actor, { status: 'QUOTED' }, { status: 'ACCEPTED', policyId: policy.data.id }, correlationId);
    return policy.data;
  }

  if (event.fieldName === 'ensureUserProfile') {
    const existing = await client.models.UserProfile.list({ filter: { owner: { eq: actor.subject } } });
    const role = ['client', ...staffGroups].includes(actor.role) ? actor.role : 'client';
    if (existing.data[0]) {
      if (existing.data[0].businessRole !== role || existing.data[0].status !== 'active') {
        const updated = await client.models.UserProfile.update({ id: existing.data[0].id, businessRole: role, status: 'active' });
        if (updated.errors?.length || !updated.data) throw new Error(updated.errors?.[0]?.message ?? 'Profile synchronization failed');
        return updated.data;
      }
      return existing.data[0];
    }
    const result = await client.models.UserProfile.create({
      owner: actor.subject, email: actor.email, displayName: actor.displayName,
      businessRole: role, status: 'active',
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Profile provisioning failed');
    return result.data;
  }

  if (event.fieldName === 'getAssignedCasePortfolio') {
    requireStaff(actor);
    if (isSenior(actor) || isDeveloper(actor)) {
      const [claims, assignments, activities, communications, documents, notes, assets, policies, assessments] = await Promise.all([
        client.models.Claim.list({}), client.models.ClaimAssignment.list({}), client.models.ClaimActivity.list({}),
        client.models.ClaimCommunication.list({}), client.models.ClaimDocument.list({}), client.models.ClaimInternalNote.list({}),
        client.models.Asset.list({}), client.models.Policy.list({}), client.models.ClaimAssessment.list({}),
      ]);
      return { claims: claims.data, assignments: assignments.data, activities: activities.data, communications: communications.data, documents: documents.data, internalNotes: notes.data, assets: assets.data, policies: policies.data, claimAssessments: assessments.data };
    }
    const assignmentResult = await client.models.ClaimAssignment.list({
      filter: { userSubject: { eq: actor.subject }, active: { eq: true } },
    });
    const claimIds = [...new Set(assignmentResult.data.map((item: any) => item.claimId))] as string[];
    const bundles = await Promise.all(claimIds.map(async (claimId) => {
      const [claim, activities, communications, documents, notes, team, assessments] = await Promise.all([
        client.models.Claim.get({ id: claimId }),
        client.models.ClaimActivity.list({ filter: { claimId: { eq: claimId } } }),
        client.models.ClaimCommunication.list({ filter: { claimId: { eq: claimId } } }),
        client.models.ClaimDocument.list({ filter: { claimId: { eq: claimId } } }),
        client.models.ClaimInternalNote.list({ filter: { claimId: { eq: claimId } } }),
        client.models.ClaimAssignment.list({ filter: { claimId: { eq: claimId } } }),
        client.models.ClaimAssessment.list({ filter: { claimId: { eq: claimId } } }),
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
    const existing = await client.models.Claim.list({ filter: { idempotencyKey: { eq: key } } });
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
    const existing = await client.models.AccountClosureRequest.list({ filter: { correlationId: { eq: key } } });
    if (existing.data[0]) return existing.data[0];
    const requestedAt = now();
    const result = await client.models.AccountClosureRequest.create({
      owner: actor.subject, requestedAt, status: 'READY_FOR_IDENTITY_DELETION',
      retentionPolicyVersion: 'ACTIVE-ACCOUNT-LIFETIME-v1', correlationId: key,
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Account closure request failed');
    const profiles = await client.models.UserProfile.list({ filter: { owner: { eq: actor.subject } } });
    const suffix = createHash('sha256').update(actor.subject).digest('hex').slice(0, 16);
    await Promise.all(profiles.data.map((profile: any) => client.models.UserProfile.update({
      id: profile.id, displayName: 'Former client', email: `closed+${suffix}@redacted.invalid`, status: 'disabled',
    })));
    const claims = await client.models.Claim.list({ filter: { owner: { eq: actor.subject } } });
    await Promise.all(claims.data.map(async (claim: any) => {
      const [activities, communications, calls] = await Promise.all([
        client.models.ClaimActivity.list({ filter: { claimId: { eq: claim.id } } }),
        client.models.ClaimCommunication.list({ filter: { claimId: { eq: claim.id } } }),
        client.models.CallRecord.list({ filter: { claimId: { eq: claim.id } } }),
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
    const documents = await client.models.ClaimDocument.list({ filter: { claimId: { eq: claim.id }, category: { eq: 'AFFIDAVIT' } } });
    const prerequisites = validateDraftPrerequisites(claim.policeCaseNumber, documents.data);
    if (!prerequisites.valid) throw new Error(prerequisites.reason ?? 'Claim draft is incomplete');
    const submittedAt = now();
    const claimNumber = `EIC-${new Date().getUTCFullYear()}-${Date.now().toString().slice(-8)}`;
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
    const duplicate = await client.models.ClaimInternalNote.list({ filter: { correlationId: { eq: String(args.idempotencyKey) } } });
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
    const existing = await client.models.ClaimCommunication.list({ filter: { idempotencyKey: { eq: key } } });
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
    const profiles = await client.models.UserProfile.list({ filter: { owner: { eq: userSubject } } });
    const profile = profiles.data.find((item: any) => item.status === 'active' && item.businessRole !== 'client');
    if (!profile) throw new Error('The selected case-team member is not an active officer');
    const key = clean(args.idempotencyKey, 'idempotencyKey');
    const prior = await client.models.ClaimAssignment.list({ filter: { correlationId: { eq: key } } });
    if (prior.data[0]) return prior.data[0];
    if (args.isLead) {
      const active = await client.models.ClaimAssignment.list({ filter: { claimId: { eq: claim.id }, isLead: { eq: true }, active: { eq: true } } });
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
    if (!canTransition(claim.status, target)) throw new Error(`Claim cannot move from ${claim.status} to ${target}`);
    if (['APPROVED', 'REJECTED'].includes(target)) requireSenior(actor);
    const changedAt = now();
    const result = await client.models.Claim.update({
      id: claim.id, status: target, currentMilestone: target, lastActivityAt: changedAt,
      closedAt: target === 'CLOSED' ? changedAt : undefined,
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Claim transition failed');
    await activity(result.data, 'STATUS_CHANGED', target, clean(args.summary, 'summary', 2), actor, correlationId, args.detail ? String(args.detail) : undefined);
    await audit(claim.id, 'status_changed', actor, { status: claim.status }, { status: target }, correlationId);
    return result.data;
  }

  if (event.fieldName === 'calculateClaimPayoutAssessment') {
    requireCaseOfficer(actor);
    const assessmentClaim = await getClaim(String(args.claimId));
    if (!(await canAccessClaim(actor, assessmentClaim))) throw new Error('Claim assignment access required');
    if (assessmentClaim.status !== 'UNDER_ASSESSMENT') throw new Error('Claim must be under assessment');
    const cleanEvidence = await client.models.ClaimDocument.list({ filter: { claimId: { eq: assessmentClaim.id }, status: { eq: 'CLEAN' } } });
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
    const prior = await client.models.ClaimAssessment.list({ filter: { idempotencyKey: { eq: key } } });
    if (prior.data[0]) return prior.data[0];
    const history = await client.models.ClaimAssessment.list({ filter: { claimId: { eq: assessmentClaim.id } } });
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
    const override = args.overridePayout === undefined || args.overridePayout === null ? undefined : Number(args.overridePayout);
    if (override !== undefined && (!Number.isFinite(override) || override < 0)) throw new Error('overridePayout must be non-negative');
    if (override !== undefined && override !== assessment.data.recommendedPayout && !String(args.overrideReason ?? '').trim()) throw new Error('An override reason is required');
    const payout = override ?? assessment.data.recommendedPayout;
    const result = await client.models.ClaimAssessment.update({
      id: assessment.data.id, recommendedPayout: payout, overrideReason: args.overrideReason ? String(args.overrideReason) : undefined,
      status: 'FINALIZED', finalizedAt: now(),
    });
    await client.models.Claim.update({ id: assessment.data.claimId, suggestedPayout: payout, status: 'DECISION_PENDING', currentMilestone: 'DECISION_PENDING', lastActivityAt: now() });
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
    const prior = await client.models.ProcessingJob.list({ filter: { correlationId: { eq: key } } });
    if (prior.data[0]) return prior.data[0];
    const affidavit = await client.models.ClaimDocument.list({ filter: { claimId: { eq: claim.id }, category: { eq: 'AFFIDAVIT' }, status: { eq: 'CLEAN' } } });
    if (!affidavit.data.length) throw new Error('The police affidavit must pass security scanning before assessment');
    const job = await client.models.ProcessingJob.create({ claimId, status: 'QUEUED', currentStep: 'queued', attempts: 0, correlationId: key });
    if (job.errors?.length || !job.data) throw new Error(job.errors?.[0]?.message ?? 'Job creation failed');
    await client.models.Claim.update({ id: claimId, status: 'UNDER_ASSESSMENT', currentMilestone: 'UNDER_ASSESSMENT' });
    const stateMachineArn = process.env.CLAIMS_STATE_MACHINE_ARN;
    if (!stateMachineArn) throw new Error('Claims workflow is not configured');
    const execution = await stepFunctions.send(new StartExecutionCommand({
      stateMachineArn, name: `claim-${claimId}-${key}`.replace(/[^A-Za-z0-9-_]/g, '').slice(0, 80),
      input: JSON.stringify({ claimId, jobId: job.data.id, correlationId }),
    }));
    await client.models.ProcessingJob.update({ id: job.data.id, executionArn: execution.executionArn });
    await activity(claim, 'ASSESSMENT_STARTED', 'UNDER_ASSESSMENT', 'Your claim assessment has started.', actor, correlationId);
    await audit(claimId, 'processing_started', actor, { status: claim.status }, { status: 'UNDER_ASSESSMENT', jobId: job.data.id }, correlationId);
    return { ...job.data, executionArn: execution.executionArn };
  }

  if (event.fieldName === 'approveClaim' || event.fieldName === 'rejectClaim') {
    requireSenior(actor);
    if (claim.status !== 'DECISION_PENDING') throw new Error('Only claims awaiting a decision can be approved or rejected');
    const approved = event.fieldName === 'approveClaim';
    const payout = approved ? Number(args.approvedPayout) : 0;
    if (!Number.isFinite(payout) || payout < 0) throw new Error('approvedPayout must be non-negative');
    if (approved && payout !== claim.suggestedPayout && !String(args.overrideReason ?? '').trim()) throw new Error('An override reason is required when changing the assessed payout');
    const reason = approved ? undefined : clean(args.reason, 'reason', 5);
    const target = approved ? 'APPROVED' : 'REJECTED';
    const result = await client.models.Claim.update({
      id: claim.id, status: target, currentMilestone: target, approvedPayout: payout,
      approvedBy: actor.subject, approvalTimestamp: now(), lastActivityAt: now(),
    });
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Decision failed');
    await activity(result.data, approved ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED', target, approved ? 'Your claim was approved.' : `Your claim was not approved: ${reason}`, actor, correlationId);
    await audit(claim.id, approved ? 'approved' : 'rejected', actor, { status: claim.status }, { status: target, approvedPayout: payout, reason, overrideReason: args.overrideReason }, correlationId);
    return result.data;
  }

  if (event.fieldName === 'assignOfficer') {
    requireSenior(actor);
    throw new Error('Use assignClaimTeamMember so assignment history and identity snapshots are preserved');
  }

  throw new Error('Unsupported claim command');
};
