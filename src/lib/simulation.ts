import type { BusinessRole, Portfolio, SimulationCommand, SimulationEvent } from '../types';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const ok = (data: any = null) => ({ data, errors: [] });
const activity = (claimId: string, milestone: string, summary: string, role: BusinessRole) => ({
  id: id('activity'), claimId, eventId: id('event'), eventType: 'MILESTONE_CHANGED', milestone,
  actorDisplayNameSnapshot: `Simulated ${role.replaceAll('_', ' ')}`, actorRoleSnapshot: role,
  summary, visibility: 'CLIENT_VISIBLE', occurredAt: now(),
});

export const assetDefinitions = Object.fromEntries(['vehicle', 'property', 'electronics', 'furniture', 'machinery'].map((assetType) => [assetType, {
  assetType, schemaVersion: 'simulation-1', fields: [
    { key: 'ownershipStatus', label: 'Ownership status', section: 'ownership', type: 'select', required: true, options: ['OWNED', 'FINANCED', 'LEASED'] },
    { key: 'identifier', label: assetType === 'vehicle' ? 'VIN' : 'Serial or identifying reference', section: 'identity', type: 'text', required: true },
    { key: 'makeModel', label: 'Make, model or construction', section: 'specifications', type: 'text', required: true },
    { key: 'conditionNotes', label: 'Condition and known defects', section: 'condition', type: 'text', required: true },
    { key: 'usage', label: 'Primary usage', section: 'usage', type: 'select', required: true, options: ['PERSONAL', 'COMMERCIAL', 'MIXED'] },
    { key: 'security', label: 'Security and storage', section: 'security', type: 'text', required: true },
    { key: 'declaredValue', label: 'Current replacement value', section: 'valuation', type: 'number', required: true },
    { key: 'priorLosses', label: 'Prior losses declared', section: 'risk', type: 'boolean', required: true },
  ],
}]));

export type SimulationResult = { portfolio: Portfolio; result: { data?: any; errors?: Array<{ message: string }> }; event: SimulationEvent };

export function simulateCommand(current: Portfolio, command: SimulationCommand, role: BusinessRole): SimulationResult {
  const portfolio = structuredClone(current);
  const args = command.args as any;
  const event = { id: id('simulation'), operation: command.operation, occurredAt: now(), actorRole: role };
  const claim = () => portfolio.claims.find((item) => item.id === args.claimId);
  const updateClaim = (status: string, summary: string) => {
    const item = claim(); if (!item) return null;
    item.status = status; item.currentMilestone = status; item.lastActivityAt = now();
    if (status === 'CLOSED') item.closedAt = now();
    portfolio.activities.push(activity(item.id, status, summary, role));
    return item;
  };

  if (command.kind === 'query' && command.operation === 'getAssetCategoryDefinitions') return { portfolio, result: ok(assetDefinitions), event };
  if (command.kind === 'model' && command.model === 'ClaimDocument' && command.operation === 'create') {
    const document = { id: id('document'), claimId: args.claimId, fileName: args.fileName, mediaType: args.mediaType || 'application/pdf', byteSize: args.byteSize || 0, status: 'CLEAN', category: args.category, visibility: args.visibility };
    portfolio.documents.push(document); return { portfolio, result: ok(document), event };
  }
  if (command.kind === 'model' && command.model === 'ApplicationDocument' && command.operation === 'create') return { portfolio, result: ok({ id: id('application-document'), ...args, status: 'CLEAN' }), event };
  if (command.kind === 'model' && command.model === 'UserProfile' && command.operation === 'update') {
    const profile = portfolio.profiles.find((item) => item.id === args.id); if (profile) profile.displayName = args.displayName;
    const activeProfile = portfolio.profile;
    if (activeProfile && activeProfile.id === args.id) activeProfile.displayName = args.displayName;
    return { portfolio, result: ok(profile), event };
  }
  if (command.operation === 'createAssetApplicationDraft') {
    const application = { id: id('application'), owner: portfolio.profile?.owner ?? 'persona-client', assetType: args.assetType, schemaVersion: 'simulation-1', status: 'DRAFT', answers: {}, completedSections: [], missingInformation: [], lastUpdatedAt: now() };
    portfolio.applications.push(application); return { portfolio, result: ok(application), event };
  }
  if (command.operation === 'saveAssetApplicationSection') {
    const application = portfolio.applications.find((item) => item.id === args.applicationId);
    if (application) { application.answers = { ...application.answers, ...args.answers }; application.completedSections = [...new Set([...application.completedSections, args.section])]; application.lastUpdatedAt = now(); }
    return { portfolio, result: ok(application), event };
  }
  if (command.operation === 'submitAssetApplication') {
    const application = portfolio.applications.find((item) => item.id === args.applicationId);
    if (application) {
      application.status = 'SUBMITTED'; application.applicationNumber ||= `EIA-SIM-${String(portfolio.applications.length).padStart(4, '0')}`; application.submittedAt = now();
      const assessment = { id: id('premium'), applicationId: application.id, indicativePremium: 1480, rangeLow: 1320, rangeHigh: 1660, riskScore: 41, factors: [{ name: 'Simulation profile', factor: 1, reason: 'Deterministic workflow test.' }], assumptions: ['Synthetic evidence accepted'] };
      portfolio.premiumAssessments.push(assessment); application.latestAssessmentId = assessment.id;
    }
    return { portfolio, result: ok(application), event };
  }
  if (command.operation === 'reviewPolicyApplication') {
    const application = portfolio.applications.find((item) => item.id === args.applicationId); if (application) application.status = args.decision;
    return { portfolio, result: ok(application), event };
  }
  if (command.operation === 'issuePolicyQuote') {
    const application = portfolio.applications.find((item) => item.id === args.applicationId);
    if (application) { application.status = 'QUOTED'; application.quotedPremium = args.monthlyPremium; application.quoteExpiresAt = new Date(Date.now() + 14 * 86400000).toISOString(); }
    return { portfolio, result: ok(application), event };
  }
  if (command.operation === 'acceptPolicyQuote') {
    const application = portfolio.applications.find((item) => item.id === args.applicationId);
    if (application) {
      application.status = 'ACCEPTED';
      const policyId = id('policy'); portfolio.policies.push({ id: policyId, policyNumber: `EIP-SIM-${portfolio.policies.length + 1}`, valuationType: 'REPLACEMENT', coverageDetails: 'Simulated accepted cover', durationMonths: 12, startDate: now(), status: 'ACTIVE', approvedPremium: application.quotedPremium });
      const asset = portfolio.assets.find((item) => item.id === application.assetId); if (asset) asset.policyId = policyId;
    }
    return { portfolio, result: ok(application), event };
  }
  if (command.operation === 'createClaimDraft') {
    const draft = { id: id('claim'), owner: portfolio.profile?.owner ?? 'persona-client', policyId: args.policyId, assetId: args.assetId, policeCaseNumber: args.policeCaseNumber, claimType: args.claimType, description: args.description, incidentDate: args.incidentDate, status: 'DRAFT' };
    portfolio.claims.push(draft); return { portfolio, result: ok(draft), event };
  }
  if (command.operation === 'submitClaimDraft') {
    const item = claim(); if (item) { item.claimNumber = `EIC-SIM-${String(portfolio.claims.length).padStart(6, '0')}`; item.submittedAt = now(); updateClaim('ASSIGNMENT_PENDING', 'Claim submitted and awaiting advisor assignment.'); }
    return { portfolio, result: ok(item), event };
  }
  if (command.operation === 'sendClaimCommunication') {
    const message = { id: id('communication'), claimId: args.claimId, channel: args.channel, direction: role === 'client' ? 'INBOUND' : 'OUTBOUND', subject: args.subject, body: args.body, senderDisplayNameSnapshot: portfolio.profile?.displayName ?? 'Simulated user', senderRoleSnapshot: role, deliveryState: args.channel === 'EMAIL' && String(args.body).includes('[fail]') ? 'FAILED' : 'DELIVERED', occurredAt: now() };
    portfolio.communications.push(message); return { portfolio, result: ok(message), event };
  }
  if (command.operation === 'addClaimInternalNote') {
    const note = { id: id('note'), claimId: args.claimId, authorDisplayNameSnapshot: portfolio.profile?.displayName ?? 'Simulated advisor', authorRoleSnapshot: role, body: args.body, occurredAt: now() };
    portfolio.internalNotes.push(note); return { portfolio, result: ok(note), event };
  }
  if (command.operation === 'assignClaimTeamMember') {
    if (args.isLead) portfolio.assignments.filter((item) => item.claimId === args.claimId && item.isLead && item.active).forEach((item) => { item.active = false; item.endedAt = now(); });
    const assignment = { id: id('assignment'), claimId: args.claimId, userSubject: args.userSubject, userDisplayNameSnapshot: args.displayName, userRoleSnapshot: args.userRole, assignmentRole: args.assignmentRole, isLead: Boolean(args.isLead), active: true, assignedAt: now() };
    portfolio.assignments.push(assignment); return { portfolio, result: ok(assignment), event };
  }
  if (command.operation === 'requestClaimInformation') return { portfolio: (updateClaim('INFO_NEEDED', String(args.request)), portfolio), result: ok(claim()), event };
  if (command.operation === 'provideClaimInformation') return { portfolio: (updateClaim('UNDER_ASSESSMENT', 'Client supplied the requested information.'), portfolio), result: ok(claim()), event };
  if (command.operation === 'startClaimProcessing') return { portfolio: (updateClaim('UNDER_ASSESSMENT', 'Advisor started evidence assessment.'), portfolio), result: ok(claim()), event };
  if (command.operation === 'transitionClaim') return { portfolio: (updateClaim(args.targetStatus, args.summary), portfolio), result: ok(claim()), event };
  if (command.operation === 'closeClaim') return { portfolio: (updateClaim('CLOSED', args.summary), portfolio), result: ok(claim()), event };
  if (command.operation === 'logClaimCall') {
    portfolio.activities.push(activity(args.claimId, claim()?.status ?? 'UNDER_ASSESSMENT', `Phone call logged: ${args.outcome}`, role));
    return { portfolio, result: ok({ id: id('call'), ...args }), event };
  }
  if (command.operation === 'calculateClaimPayoutAssessment') {
    const recommendedPayout = Math.max(0, Math.min(args.coveredLossValue, args.policyLimit) * (1 - args.depreciation) - args.excess);
    const assessment = { id: id('assessment'), claimId: args.claimId, version: portfolio.claimAssessments.filter((item) => item.claimId === args.claimId).length + 1, evidenceReviewed: args.evidenceReviewed, coveredLossValue: args.coveredLossValue, repairEstimate: args.repairEstimate, replacementEstimate: args.replacementEstimate, policyLimit: args.policyLimit, excess: args.excess, depreciation: args.depreciation, exclusions: args.exclusions, recommendedPayout, status: 'DRAFT' };
    portfolio.claimAssessments.push(assessment); return { portfolio, result: ok(assessment), event };
  }
  if (command.operation === 'finalizeClaimPayoutAssessment') {
    const assessment = portfolio.claimAssessments.find((item) => item.id === args.assessmentId);
    if (assessment) { assessment.status = 'FINALIZED'; const item = portfolio.claims.find((entry) => entry.id === assessment.claimId); if (item) { item.suggestedPayout = assessment.recommendedPayout; args.claimId = item.id; updateClaim('DECISION_PENDING', 'Evidence assessment finalized for senior decision.'); } }
    return { portfolio, result: ok(assessment), event };
  }
  if (command.operation === 'approveClaim') {
    const item = claim(); if (item) item.approvedPayout = args.approvedPayout; updateClaim('APPROVED', 'A senior officer approved the payout.');
    return { portfolio, result: ok(item), event };
  }
  if (command.operation === 'rejectClaim') return { portfolio: (updateClaim('REJECTED', String(args.reason)), portfolio), result: ok(claim()), event };
  if (command.operation === 'requestAccountClosure') {
    if (portfolio.profile) portfolio.profile.status = 'CLOSURE_REQUESTED';
    return { portfolio, result: ok({ accepted: true }), event };
  }
  return { portfolio, result: { errors: [{ message: `Simulation adapter does not yet support ${command.operation}.` }] }, event };
}
