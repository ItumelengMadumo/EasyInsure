import { a, defineData } from '@aws-amplify/backend';
import { insuranceEngine } from '../functions/insurance-engine/resource';
import { claimsCommand } from '../functions/claims-command/resource';
import { claimsCopilot } from '../functions/claims-copilot/resource';
import { processClaim } from '../functions/process-claim/resource';

const staff = ['junior_officer', 'intermediate_officer', 'senior_officer', 'superuser'];
const senior = ['senior_officer', 'superuser'];

const schema = a.schema({
  BusinessRole: a.enum(['client', 'junior_officer', 'intermediate_officer', 'senior_officer', 'superuser']),
  AccountStatus: a.enum(['active', 'suspended', 'disabled']),
  ClaimStatus: a.enum(['DRAFT', 'SUBMITTED', 'PROCESSING', 'REVIEW', 'APPROVED', 'REJECTED', 'PAID', 'FAILED']),
  JobStatus: a.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER']),
  DocumentStatus: a.enum(['QUARANTINED', 'SCANNING', 'CLEAN', 'REJECTED', 'EXTRACTED', 'FAILED']),

  UserProfile: a.model({
    owner: a.string().required(),
    email: a.email().required(),
    displayName: a.string(),
    businessRole: a.ref('BusinessRole').required(),
    status: a.ref('AccountStatus').required(),
  }).authorization((allow) => [
    allow.ownerDefinedIn('owner').to(['read', 'update']),
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
    policyId: a.id(),
  }).secondaryIndexes((index) => [index('owner'), index('policyId')]).authorization((allow) => [
    allow.ownerDefinedIn('owner'),
    allow.groups(staff).to(['read']),
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
    allow.groups(staff).to(['read']),
    allow.groups(senior),
  ]),

  Claim: a.model({
    owner: a.string().required(),
    claimNumber: a.string().required(),
    policyId: a.id().required(),
    assetId: a.id().required(),
    claimType: a.string().required(),
    description: a.string().required(),
    incidentDate: a.datetime().required(),
    incidentLocation: a.string(),
    amountRequested: a.float().required(),
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
    idempotencyKey: a.string().required(),
  }).secondaryIndexes((index) => [index('owner'), index('status'), index('assignedOfficerId'), index('idempotencyKey')]).authorization((allow) => [
    allow.ownerDefinedIn('owner').to(['read']),
    allow.groups(staff).to(['read']),
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
  }).secondaryIndexes((index) => [index('claimId'), index('checksum')]).authorization((allow) => [
    allow.ownerDefinedIn('owner').to(['create', 'read']),
    allow.groups(staff).to(['read']),
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
    allow.groups(staff).to(['read']),
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
    allow.groups(['superuser']).to(['read']),
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
    allow.groups(staff).to(['read']),
  ]),

  runInsuranceEngine: a.query()
    .arguments({ operation: a.string().required(), payload: a.json().required() })
    .returns(a.json())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(insuranceEngine)),

  submitClaim: a.mutation().arguments({
    policyId: a.id().required(), assetId: a.id().required(), claimType: a.string().required(),
    description: a.string().required(), incidentDate: a.datetime().required(), incidentLocation: a.string(),
    amountRequested: a.float().required(), idempotencyKey: a.string().required(), correlationId: a.string().required(),
  }).returns(a.ref('Claim')).authorization((allow) => [allow.authenticated()]).handler(a.handler.function(claimsCommand)),
  approveClaim: a.mutation().arguments({
    claimId: a.id().required(), approvedPayout: a.float().required(), correlationId: a.string().required(),
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
  CopilotResult: a.customType({
    summary: a.string().required(), inconsistencies: a.string().array().required(), missingInformation: a.string().array().required(),
    recommendation: a.string().required(), confidence: a.float().required(), warnings: a.string().array().required(),
    modelId: a.string().required(), promptVersion: a.string().required(), latencyMs: a.integer().required(),
  }),
  generateClaimCopilot: a.query().arguments({
    claim: a.json().required(), deterministicOutputs: a.json().required(), evidenceText: a.string(),
  }).returns(a.ref('CopilotResult')).authorization((allow) => [allow.groups(staff)]).handler(a.handler.function(claimsCopilot)),
}).authorization((allow) => [allow.resource(claimsCommand), allow.resource(processClaim)]);

// The runtime schema remains the source of truth. The current TypeScript compiler
// exceeds its instantiation limit on this domain-sized schema, so clients use a
// narrow local interface until Amplify codegen emits the deployed client types.
export type Schema = any;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
});
