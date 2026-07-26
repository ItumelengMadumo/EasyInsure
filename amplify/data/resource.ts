import { a, defineData } from '@aws-amplify/backend';
import { insuranceEngine } from '../functions/insurance-engine/resource';
import { claimsCommand } from '../functions/claims-command/resource';
import { claimsCopilot } from '../functions/claims-copilot/resource';
import { processClaim } from '../functions/process-claim/resource';
import { scanEvidence } from '../functions/scan-evidence/resource';
import { communicationWorker } from '../functions/communication-worker/resource';
import { communicationWebhook } from '../functions/communication-webhook/resource';
import { assignmentWorker } from '../functions/assignment-worker/resource';

const staff = ['junior_officer', 'intermediate_officer', 'senior_officer', 'developer', 'superuser'];
const senior = ['senior_officer', 'superuser'];

const schema = a.schema({
  BusinessRole: a.enum(['client', 'junior_officer', 'intermediate_officer', 'senior_officer', 'developer', 'superuser']),
  AccountStatus: a.enum(['active', 'suspended', 'disabled']),
  ClaimStatus: a.enum(['DRAFT', 'SUBMITTED', 'ASSIGNMENT_PENDING', 'VALIDATING', 'UNDER_ASSESSMENT', 'INFO_NEEDED', 'DECISION_PENDING', 'APPROVED', 'REJECTED', 'PAYMENT_PENDING', 'PAID', 'CLOSED', 'FAILED']),
  JobStatus: a.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER']),
  DocumentStatus: a.enum(['QUARANTINED', 'SCANNING', 'CLEAN', 'REJECTED', 'EXTRACTED', 'FAILED']),
  DocumentCategory: a.enum(['AFFIDAVIT', 'INCIDENT_EVIDENCE', 'IDENTITY', 'VALUATION', 'CORRESPONDENCE', 'OTHER']),
  CaseVisibility: a.enum(['CLIENT_VISIBLE', 'INTERNAL']),
  CommunicationChannel: a.enum(['PORTAL', 'EMAIL', 'SMS', 'WHATSAPP', 'PHONE']),
  CommunicationDirection: a.enum(['INBOUND', 'OUTBOUND', 'INTERNAL']),
  DeliveryState: a.enum(['NOT_REQUIRED', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'DISABLED']),
  AssignmentRole: a.enum(['LEAD_ADVISOR', 'SUPPORTING_ADVISOR', 'ASSESSOR', 'SUPERVISOR', 'SPECIALIST']),
  AssetStatus: a.enum(['DRAFT', 'UNDER_REVIEW', 'INSURABLE', 'DECLINED', 'ARCHIVED']),
  PolicyApplicationStatus: a.enum(['DRAFT', 'SUBMITTED', 'MORE_INFO_REQUIRED', 'UNDER_REVIEW', 'QUOTED', 'ACCEPTED', 'DECLINED']),

  UserProfile: a.model({
    owner: a.string().required(),
    email: a.email().required(),
    displayName: a.string(),
    businessRole: a.ref('BusinessRole').required(),
    status: a.ref('AccountStatus').required(),
  }).authorization((allow) => [
    allow.ownerDefinedIn('owner').to(['read', 'update']),
    allow.groups(['senior_officer']).to(['read']),
    allow.groups(['superuser']),
  ]),

  Asset: a.model({
    owner: a.string().required(),
    assetType: a.string().required(),
    description: a.string(),
    purchasePrice: a.float().required(),
    purchaseDate: a.datetime().required(),
    condition: a.string().required(),
    serialNumber: a.string(),
    make: a.string(),
    model: a.string(),
    year: a.integer(),
    address: a.string(),
    squareFootage: a.float(),
    registrationNumber: a.string(),
    vin: a.string(),
    mileageKm: a.integer(),
    constructionType: a.string(),
    roofType: a.string(),
    occupancyType: a.string(),
    securityFeatures: a.string(),
    purchaseSource: a.string(),
    assetUse: a.string(),
    portable: a.boolean(),
    policyId: a.id(),
    status: a.ref('AssetStatus'),
    searchText: a.string(),
    registeredAt: a.datetime(),
    lastUpdatedAt: a.datetime(),
  }).secondaryIndexes((index) => [index('owner').sortKeys(['registeredAt']), index('policyId'), index('status').sortKeys(['lastUpdatedAt']), index('assetType').sortKeys(['lastUpdatedAt'])]).authorization((allow) => [
    allow.ownerDefinedIn('owner').to(['read']),
    allow.groups(senior).to(['read']),
  ]),

  AssetDetail: a.model({
    owner: a.string().required(), assetId: a.id().required(), assetType: a.string().required(),
    schemaVersion: a.string().required(), answers: a.json().required(),
    completedSections: a.string().array().required(), createdAtSnapshot: a.datetime().required(),
  }).secondaryIndexes((index) => [index('assetId'), index('owner')]).authorization((allow) => [
    allow.ownerDefinedIn('owner').to(['read']), allow.groups(senior),
  ]),

  UnderwritingProfile: a.model({
    owner: a.string().required(), version: a.integer().required(), consentGiven: a.boolean().required(),
    consentedAt: a.datetime(), declarations: a.json().required(), createdAtSnapshot: a.datetime().required(),
  }).secondaryIndexes((index) => [index('owner').sortKeys(['version'])]).authorization((allow) => [
    allow.ownerDefinedIn('owner').to(['read']), allow.groups(senior),
  ]),

  PolicyApplication: a.model({
    owner: a.string().required(), applicationNumber: a.string(), assetId: a.id(),
    assetType: a.string().required(), schemaVersion: a.string().required(),
    status: a.ref('PolicyApplicationStatus').required(), answers: a.json().required(),
    completedSections: a.string().array().required(), missingInformation: a.string().array().required(),
    underwritingProfileId: a.id(), latestAssessmentId: a.id(), quotedPremium: a.float(),
    quoteExpiresAt: a.datetime(), submittedAt: a.datetime(), acceptedAt: a.datetime(),
    assignedUnderwriterId: a.string(), idempotencyKey: a.string().required(), lastUpdatedAt: a.datetime().required(),
  }).secondaryIndexes((index) => [
    index('owner').sortKeys(['lastUpdatedAt']), index('status').sortKeys(['lastUpdatedAt']),
    index('assignedUnderwriterId').sortKeys(['lastUpdatedAt']), index('applicationNumber'), index('assetId'),
  ]).authorization((allow) => [allow.ownerDefinedIn('owner').to(['read']), allow.groups(senior)]),

  PremiumAssessment: a.model({
    owner: a.string().required(), applicationId: a.id().required(), version: a.integer().required(),
    formulaVersion: a.string().required(), inputSnapshot: a.json().required(), factors: a.json().required(),
    riskScore: a.float().required(), indicativePremium: a.float().required(), rangeLow: a.float().required(),
    rangeHigh: a.float().required(), assumptions: a.string().array().required(),
    actorSubject: a.string().required(), actorDisplayNameSnapshot: a.string().required(), overrideReason: a.string(),
    createdAtSnapshot: a.datetime().required(), idempotencyKey: a.string().required(),
  }).secondaryIndexes((index) => [index('applicationId').sortKeys(['version']), index('idempotencyKey')]).authorization((allow) => [
    allow.ownerDefinedIn('owner').to(['read']), allow.groups(senior),
  ]),

  ApplicationDocument: a.model({
    owner: a.string().required(), applicationId: a.id().required(), category: a.string().required(),
    objectKey: a.string().required(), fileName: a.string().required(), mediaType: a.string().required(),
    byteSize: a.integer().required(), checksum: a.string().required(), status: a.ref('DocumentStatus').required(),
    uploadedAt: a.datetime().required(),
  }).secondaryIndexes((index) => [index('applicationId'), index('checksum')]).authorization((allow) => [
    allow.ownerDefinedIn('owner').to(['create', 'read']), allow.groups(senior).to(['read']),
  ]),

  AssetValuation: a.model({
    owner: a.string().required(),
    assetId: a.id().required(),
    valuationDate: a.datetime().required(),
    currentValue: a.float().required(),
    depreciationRateUsed: a.float().required(),
    yearsElapsed: a.float().required(),
    condition: a.string().required(),
    method: a.string().required(),
    notes: a.string(),
  }).secondaryIndexes((index) => [index('assetId')]).authorization((allow) => [
    allow.ownerDefinedIn('owner').to(['read']),
    allow.groups(staff),
  ]),

  Policy: a.model({
    owner: a.string().required(),
    policyNumber: a.string().required(),
    valuationType: a.string().required(),
    coverageDetails: a.string(),
    durationMonths: a.integer().required(),
    startDate: a.datetime().required(),
    endDate: a.datetime(),
    status: a.string().required(),
    suggestedPremium: a.float(),
    approvedPremium: a.float(),
    approvedBy: a.string(),
    approvalTimestamp: a.datetime(),
  }).secondaryIndexes((index) => [index('owner'), index('policyNumber')]).authorization((allow) => [
    allow.ownerDefinedIn('owner').to(['read']),
    allow.groups(senior),
  ]),

  Claim: a.model({
    owner: a.string().required(),
    claimNumber: a.string(),
    policeCaseNumber: a.string(),
    policyId: a.id().required(),
    assetId: a.id().required(),
    claimType: a.string().required(),
    description: a.string().required(),
    incidentDate: a.datetime().required(),
    incidentLocation: a.string(),
    amountRequested: a.float(),
    legacyRequestedAmount: a.float(),
    tier: a.integer(),
    status: a.ref('ClaimStatus').required(),
    riskScore: a.float(),
    fraudFlag: a.boolean(),
    fraudReason: a.string(),
    suggestedPayout: a.float(),
    approvedPayout: a.float(),
    approvedBy: a.string(),
    approvalTimestamp: a.datetime(),
    assignedOfficerId: a.string(),
    currentMilestone: a.string(),
    submittedAt: a.datetime(),
    closedAt: a.datetime(),
    lastActivityAt: a.datetime(),
    assignmentDueAt: a.datetime(),
    idempotencyKey: a.string().required(),
  }).secondaryIndexes((index) => [
    index('owner').sortKeys(['submittedAt']),
    index('status').sortKeys(['lastActivityAt']),
    index('assignedOfficerId').sortKeys(['lastActivityAt']),
    index('claimNumber'), index('policeCaseNumber'), index('idempotencyKey'),
  ]).authorization((allow) => [
    allow.ownerDefinedIn('owner').to(['read']),
    allow.groups(senior),
  ]),

  ClaimDocument: a.model({
    owner: a.string().required(),
    claimId: a.id().required(),
    objectKey: a.string().required(),
    fileName: a.string().required(),
    mediaType: a.string().required(),
    byteSize: a.integer().required(),
    checksum: a.string().required(),
    status: a.ref('DocumentStatus').required(),
    uploadedBy: a.string().required(),
    extractedTextKey: a.string(),
    category: a.ref('DocumentCategory'),
    visibility: a.ref('CaseVisibility'),
  }).secondaryIndexes((index) => [index('claimId'), index('checksum')]).authorization((allow) => [
    allow.ownerDefinedIn('owner').to(['create', 'read']),
    allow.groups(senior).to(['read']),
  ]),

  ClaimAssignment: a.model({
    claimId: a.id().required(),
    claimOwner: a.string().required(),
    userSubject: a.string().required(),
    userDisplayNameSnapshot: a.string().required(),
    userRoleSnapshot: a.string().required(),
    assignmentRole: a.ref('AssignmentRole').required(),
    isLead: a.boolean().required(),
    active: a.boolean().required(),
    assignedAt: a.datetime().required(),
    endedAt: a.datetime(),
    assignedBy: a.string().required(),
    endedBy: a.string(),
    correlationId: a.string().required(),
  }).secondaryIndexes((index) => [
    index('claimId').sortKeys(['assignedAt']),
    index('userSubject').sortKeys(['assignedAt']),
    index('claimOwner').sortKeys(['assignedAt']),
  ]).authorization((allow) => [
    allow.ownerDefinedIn('claimOwner').to(['read']),
    allow.groups(senior),
  ]),

  ClaimActivity: a.model({
    owner: a.string().required(),
    claimId: a.id().required(),
    eventId: a.string().required(),
    eventType: a.string().required(),
    milestone: a.string().required(),
    actorSubject: a.string().required(),
    actorDisplayNameSnapshot: a.string().required(),
    actorRoleSnapshot: a.string().required(),
    summary: a.string().required(),
    detail: a.string(),
    visibility: a.ref('CaseVisibility').required(),
    occurredAt: a.datetime().required(),
    correlationId: a.string().required(),
  }).secondaryIndexes((index) => [
    index('claimId').sortKeys(['occurredAt', 'eventId']),
    index('owner').sortKeys(['occurredAt']),
    index('eventId'),
  ]).authorization((allow) => [
    allow.ownerDefinedIn('owner').to(['read']),
    allow.groups(senior).to(['read']),
  ]),

  ClaimInternalNote: a.model({
    claimId: a.id().required(),
    authorSubject: a.string().required(),
    authorDisplayNameSnapshot: a.string().required(),
    authorRoleSnapshot: a.string().required(),
    body: a.string().required(),
    occurredAt: a.datetime().required(),
    correlationId: a.string().required(),
  }).secondaryIndexes((index) => [index('claimId').sortKeys(['occurredAt'])]).authorization((allow) => [allow.groups(senior)]),

  ClaimCommunication: a.model({
    owner: a.string().required(),
    claimId: a.id().required(),
    channel: a.ref('CommunicationChannel').required(),
    direction: a.ref('CommunicationDirection').required(),
    subject: a.string(),
    body: a.string().required(),
    senderSubject: a.string().required(),
    senderDisplayNameSnapshot: a.string().required(),
    senderRoleSnapshot: a.string().required(),
    recipientSnapshots: a.string().array().required(),
    visibility: a.ref('CaseVisibility').required(),
    provider: a.string().required(),
    providerReference: a.string(),
    deliveryState: a.ref('DeliveryState').required(),
    sentAt: a.datetime(),
    deliveredAt: a.datetime(),
    occurredAt: a.datetime().required(),
    replyToId: a.id(),
    threadReference: a.string(),
    idempotencyKey: a.string().required(),
    correlationId: a.string().required(),
  }).secondaryIndexes((index) => [
    index('claimId').sortKeys(['occurredAt']),
    index('owner').sortKeys(['occurredAt']),
    index('providerReference'), index('idempotencyKey'),
  ]).authorization((allow) => [
    allow.ownerDefinedIn('owner').to(['read']),
    allow.groups(senior).to(['read']),
  ]),

  CommunicationDelivery: a.model({
    communicationId: a.id().required(),
    claimId: a.id().required(),
    channel: a.ref('CommunicationChannel').required(),
    provider: a.string().required(),
    state: a.ref('DeliveryState').required(),
    attempts: a.integer().required(),
    failureCategory: a.string(),
    failureMessage: a.string(),
    providerReference: a.string(),
    attemptedAt: a.datetime(),
    completedAt: a.datetime(),
    correlationId: a.string().required(),
  }).secondaryIndexes((index) => [
    index('communicationId'), index('claimId'), index('state').sortKeys(['attemptedAt']),
  ]).authorization((allow) => [allow.groups(senior).to(['read'])]),

  CallRecord: a.model({
    claimId: a.id().required(),
    communicationId: a.id(),
    direction: a.ref('CommunicationDirection').required(),
    participantSnapshots: a.string().array().required(),
    startedAt: a.datetime().required(),
    endedAt: a.datetime(),
    consentStatus: a.string().required(),
    outcome: a.string().required(),
    advisorNotes: a.string(),
    transcriptKey: a.string(),
    recordingKey: a.string(),
    loggedBySubject: a.string().required(),
    loggedByDisplayNameSnapshot: a.string().required(),
    correlationId: a.string().required(),
  }).secondaryIndexes((index) => [index('claimId').sortKeys(['startedAt'])]).authorization((allow) => [allow.groups(senior)]),

  InboundReconciliation: a.model({
    channel: a.ref('CommunicationChannel').required(),
    provider: a.string().required(),
    providerReference: a.string().required(),
    senderSnapshot: a.string().required(),
    subject: a.string(),
    bodyPreview: a.string().required(),
    receivedAt: a.datetime().required(),
    status: a.string().required(),
    matchedClaimId: a.id(),
    resolvedBy: a.string(),
    resolvedAt: a.datetime(),
    correlationId: a.string().required(),
  }).secondaryIndexes((index) => [
    index('status').sortKeys(['receivedAt']), index('providerReference'),
  ]).authorization((allow) => [allow.groups(senior)]),

  AccountClosureRequest: a.model({
    owner: a.string().required(),
    requestedAt: a.datetime().required(),
    status: a.string().required(),
    anonymisedAt: a.datetime(),
    retentionPolicyVersion: a.string().required(),
    correlationId: a.string().required(),
  }).secondaryIndexes((index) => [
    index('owner'), index('status').sortKeys(['requestedAt']),
  ]).authorization((allow) => [
    allow.ownerDefinedIn('owner').to(['create', 'read']),
    allow.groups(senior),
  ]),

  ClaimAnalysis: a.model({
    claimId: a.id().required(),
    version: a.integer().required(),
    calculationInputs: a.json().required(),
    deterministicOutputs: a.json().required(),
    aiSummary: a.string(),
    recommendation: a.string(),
    inconsistencies: a.string().array(),
    missingInformation: a.string().array(),
    modelId: a.string(),
    promptVersion: a.string().required(),
    confidence: a.float(),
    warnings: a.string().array(),
    latencyMs: a.integer(),
    inferenceStatus: a.string().required(),
  }).secondaryIndexes((index) => [index('claimId')]).authorization((allow) => [
    allow.groups(senior).to(['read']),
  ]),

  ClaimAssessment: a.model({
    claimId: a.id().required(), claimOwner: a.string().required(), version: a.integer().required(),
    evidenceReviewed: a.string().array().required(), coveredLossValue: a.float().required(),
    repairEstimate: a.float(), replacementEstimate: a.float(), policyLimit: a.float().required(),
    excess: a.float().required(), depreciation: a.float().required(), exclusions: a.string().array().required(),
    recommendedPayout: a.float().required(), calculationVersion: a.string().required(), status: a.string().required(),
    assessorSubject: a.string().required(), assessorDisplayNameSnapshot: a.string().required(),
    assessorRoleSnapshot: a.string().required(), overrideReason: a.string(), createdAtSnapshot: a.datetime().required(),
    finalizedAt: a.datetime(), idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).secondaryIndexes((index) => [index('claimId').sortKeys(['version']), index('idempotencyKey')]).authorization((allow) => [
    allow.ownerDefinedIn('claimOwner').to(['read']), allow.groups(senior),
  ]),

  AuditEvent: a.model({
    entityType: a.string().required(),
    entityId: a.string().required(),
    action: a.string().required(),
    actorSubject: a.string().required(),
    actorGroups: a.string().array(),
    previousValue: a.json(),
    newValue: a.json(),
    correlationId: a.string().required(),
    occurredAt: a.datetime().required(),
  }).secondaryIndexes((index) => [index('entityId'), index('correlationId')]).authorization((allow) => [
    allow.groups(senior).to(['read']),
  ]),

  ProcessingJob: a.model({
    claimId: a.id().required(),
    executionArn: a.string(),
    status: a.ref('JobStatus').required(),
    currentStep: a.string().required(),
    attempts: a.integer().required(),
    errorCategory: a.string(),
    errorMessage: a.string(),
    correlationId: a.string().required(),
    startedAt: a.datetime(),
    completedAt: a.datetime(),
  }).secondaryIndexes((index) => [index('claimId'), index('status')]).authorization((allow) => [
    allow.groups(senior).to(['read']),
  ]),

  runInsuranceEngine: a.query()
    .arguments({ operation: a.string().required(), payload: a.json().required() })
    .returns(a.json())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(insuranceEngine)),
  getAssignedCasePortfolio: a.query()
    .returns(a.json())
    .authorization((allow) => [allow.groups(staff)])
    .handler(a.handler.function(claimsCommand)),
  ensureUserProfile: a.mutation()
    .returns(a.ref('UserProfile'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(claimsCommand)),
  getAssetCategoryDefinitions: a.query().returns(a.json())
    .authorization((allow) => [allow.authenticated()]).handler(a.handler.function(claimsCommand)),
  searchAssets: a.query().arguments({ query: a.string(), filters: a.json(), sort: a.string() }).returns(a.json())
    .authorization((allow) => [allow.authenticated()]).handler(a.handler.function(claimsCommand)),
  createAssetApplicationDraft: a.mutation().arguments({
    assetType: a.string().required(), idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('PolicyApplication')).authorization((allow) => [allow.authenticated()]).handler(a.handler.function(claimsCommand)),
  saveAssetApplicationSection: a.mutation().arguments({
    applicationId: a.id().required(), section: a.string().required(), answers: a.json().required(),
    idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('PolicyApplication')).authorization((allow) => [allow.authenticated()]).handler(a.handler.function(claimsCommand)),
  submitAssetApplication: a.mutation().arguments({
    applicationId: a.id().required(), idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('PolicyApplication')).authorization((allow) => [allow.authenticated()]).handler(a.handler.function(claimsCommand)),
  calculateIndicativePremium: a.mutation().arguments({
    applicationId: a.id().required(), idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('PremiumAssessment')).authorization((allow) => [allow.authenticated()]).handler(a.handler.function(claimsCommand)),
  requestUnderwritingInformation: a.mutation().arguments({
    applicationId: a.id().required(), missingInformation: a.string().array().required(),
    idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('PolicyApplication')).authorization((allow) => [allow.groups(senior)]).handler(a.handler.function(claimsCommand)),
  reviewPolicyApplication: a.mutation().arguments({
    applicationId: a.id().required(), decision: a.string().required(), reason: a.string(),
    idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('PolicyApplication')).authorization((allow) => [allow.groups(senior)]).handler(a.handler.function(claimsCommand)),
  issuePolicyQuote: a.mutation().arguments({
    applicationId: a.id().required(), monthlyPremium: a.float().required(), overrideReason: a.string(),
    idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('PolicyApplication')).authorization((allow) => [allow.groups(senior)]).handler(a.handler.function(claimsCommand)),
  acceptPolicyQuote: a.mutation().arguments({
    applicationId: a.id().required(), idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('Policy')).authorization((allow) => [allow.authenticated()]).handler(a.handler.function(claimsCommand)),

  createClaimDraft: a.mutation().arguments({
    policyId: a.id().required(), assetId: a.id().required(), policeCaseNumber: a.string().required(),
    claimType: a.string().required(), description: a.string().required(), incidentDate: a.datetime().required(),
    incidentLocation: a.string(), idempotencyKey: a.string().required(),
    correlationId: a.string().required(),
  }).returns(a.ref('Claim')).authorization((allow) => [allow.authenticated()]).handler(a.handler.function(claimsCommand)),
  submitClaimDraft: a.mutation().arguments({
    claimId: a.id().required(), idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('Claim')).authorization((allow) => [allow.authenticated()]).handler(a.handler.function(claimsCommand)),
  submitClaim: a.mutation().arguments({
    policyId: a.id().required(), assetId: a.id().required(), claimType: a.string().required(),
    description: a.string().required(), incidentDate: a.datetime().required(), incidentLocation: a.string(),
    idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('Claim')).authorization((allow) => [allow.authenticated()]).handler(a.handler.function(claimsCommand)),
  approveClaim: a.mutation().arguments({
    claimId: a.id().required(), approvedPayout: a.float().required(), overrideReason: a.string(), correlationId: a.string().required(),
  }).returns(a.ref('Claim')).authorization((allow) => [allow.groups(senior)]).handler(a.handler.function(claimsCommand)),
  rejectClaim: a.mutation().arguments({
    claimId: a.id().required(), reason: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('Claim')).authorization((allow) => [allow.groups(senior)]).handler(a.handler.function(claimsCommand)),
  assignOfficer: a.mutation().arguments({
    claimId: a.id().required(), officerSubject: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('Claim')).authorization((allow) => [allow.groups(['intermediate_officer', 'senior_officer', 'superuser'])]).handler(a.handler.function(claimsCommand)),
  startClaimProcessing: a.mutation().arguments({
    claimId: a.id().required(), idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('ProcessingJob')).authorization((allow) => [allow.groups(staff)]).handler(a.handler.function(claimsCommand)),
  assignClaimTeamMember: a.mutation().arguments({
    claimId: a.id().required(), userSubject: a.string().required(), displayName: a.string().required(),
    userRole: a.string().required(), assignmentRole: a.string().required(), isLead: a.boolean().required(),
    idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('ClaimAssignment')).authorization((allow) => [allow.groups(senior)]).handler(a.handler.function(claimsCommand)),
  endClaimAssignment: a.mutation().arguments({
    assignmentId: a.id().required(), idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('ClaimAssignment')).authorization((allow) => [allow.groups(senior)]).handler(a.handler.function(claimsCommand)),
  transitionClaim: a.mutation().arguments({
    claimId: a.id().required(), targetStatus: a.string().required(), summary: a.string().required(),
    detail: a.string(), idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('Claim')).authorization((allow) => [allow.groups(staff)]).handler(a.handler.function(claimsCommand)),
  requestClaimInformation: a.mutation().arguments({
    claimId: a.id().required(), request: a.string().required(),
    idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('Claim')).authorization((allow) => [allow.groups(staff)]).handler(a.handler.function(claimsCommand)),
  provideClaimInformation: a.mutation().arguments({
    claimId: a.id().required(), response: a.string().required(),
    idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('Claim')).authorization((allow) => [allow.authenticated()]).handler(a.handler.function(claimsCommand)),
  sendClaimCommunication: a.mutation().arguments({
    claimId: a.id().required(), channel: a.string().required(), body: a.string().required(), subject: a.string(),
    visibility: a.string().required(), recipients: a.string().array().required(),
    idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('ClaimCommunication')).authorization((allow) => [allow.authenticated()]).handler(a.handler.function(claimsCommand)),
  addClaimInternalNote: a.mutation().arguments({
    claimId: a.id().required(), body: a.string().required(),
    idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('ClaimInternalNote')).authorization((allow) => [allow.groups(staff)]).handler(a.handler.function(claimsCommand)),
  logClaimCall: a.mutation().arguments({
    claimId: a.id().required(), direction: a.string().required(), participants: a.string().array().required(),
    startedAt: a.datetime().required(), endedAt: a.datetime(), consentStatus: a.string().required(),
    outcome: a.string().required(), advisorNotes: a.string(), transcriptKey: a.string(), recordingKey: a.string(),
    idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('CallRecord')).authorization((allow) => [allow.groups(staff)]).handler(a.handler.function(claimsCommand)),
  calculateClaimPayoutAssessment: a.mutation().arguments({
    claimId: a.id().required(), evidenceReviewed: a.string().array().required(), coveredLossValue: a.float().required(),
    repairEstimate: a.float(), replacementEstimate: a.float(), policyLimit: a.float().required(), excess: a.float().required(),
    depreciation: a.float().required(), exclusions: a.string().array().required(),
    idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('ClaimAssessment')).authorization((allow) => [allow.groups(staff)]).handler(a.handler.function(claimsCommand)),
  finalizeClaimPayoutAssessment: a.mutation().arguments({
    assessmentId: a.id().required(), overridePayout: a.float(), overrideReason: a.string(),
    idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('ClaimAssessment')).authorization((allow) => [allow.groups(senior)]).handler(a.handler.function(claimsCommand)),
  closeClaim: a.mutation().arguments({
    claimId: a.id().required(), summary: a.string().required(), idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('Claim')).authorization((allow) => [allow.groups(senior)]).handler(a.handler.function(claimsCommand)),
  requestAccountClosure: a.mutation().arguments({
    idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('AccountClosureRequest')).authorization((allow) => [allow.authenticated()]).handler(a.handler.function(claimsCommand)),
  CopilotResult: a.customType({
    summary: a.string().required(), inconsistencies: a.string().array().required(), missingInformation: a.string().array().required(),
    recommendation: a.string().required(), confidence: a.float().required(), warnings: a.string().array().required(),
    modelId: a.string().required(), promptVersion: a.string().required(), latencyMs: a.integer().required(),
  }),
  generateClaimCopilot: a.query().arguments({
    claim: a.json().required(), deterministicOutputs: a.json().required(), evidenceText: a.string(),
  }).returns(a.ref('CopilotResult')).authorization((allow) => [allow.groups(staff)]).handler(a.handler.function(claimsCopilot)),
}).authorization((allow) => [
  allow.resource(claimsCommand), allow.resource(processClaim), allow.resource(scanEvidence),
  allow.resource(communicationWorker), allow.resource(communicationWebhook),
  allow.resource(assignmentWorker),
]);

// The runtime schema remains the source of truth. The current TypeScript compiler
// exceeds its instantiation limit on this domain-sized schema, so clients use a
// narrow local interface until Amplify codegen emits the deployed client types.
export type Schema = any;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
});
