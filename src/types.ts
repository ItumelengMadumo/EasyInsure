export type Page =
  | 'overview'
  | 'assets'
  | 'policies'
  | 'claims'
  | 'documents'
  | 'review'
  | 'profile'
  | 'admin'
  | 'diagnostics';

export type Asset = {
  id: string;
  assetType: string;
  description?: string | null;
  purchasePrice: number;
  purchaseDate: string;
  condition: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  serialNumber?: string | null;
  registrationNumber?: string | null;
  vin?: string | null;
  mileageKm?: number | null;
  address?: string | null;
  squareFootage?: number | null;
  constructionType?: string | null;
  roofType?: string | null;
  occupancyType?: string | null;
  securityFeatures?: string | null;
  purchaseSource?: string | null;
  assetUse?: string | null;
  portable?: boolean | null;
  policyId?: string | null;
  status?: string | null;
  searchText?: string | null;
  registeredAt?: string | null;
  lastUpdatedAt?: string | null;
};

export type PolicyApplication = {
  id: string; owner: string; applicationNumber?: string | null; assetId?: string | null;
  assetType: string; schemaVersion: string; status: string; answers: Record<string, unknown>;
  completedSections: string[]; missingInformation: string[]; latestAssessmentId?: string | null;
  quotedPremium?: number | null; quoteExpiresAt?: string | null; submittedAt?: string | null; lastUpdatedAt: string;
  quoteTerms?: QuoteTerms | null; acceptedAt?: string | null;
};

/** What the client is agreeing to when they accept a quote. Captured by the underwriter at quote time. */
export type QuoteTerms = { excess: number; coverLimit: number; exclusions: string[]; wordingVersion: string };

export type PremiumAssessment = {
  id: string; applicationId: string; indicativePremium: number; rangeLow: number; rangeHigh: number;
  riskScore: number; factors: Array<{ name: string; factor: number; reason: string }>; assumptions: string[];
};

export type Policy = {
  id: string;
  policyNumber: string;
  valuationType: string;
  coverageDetails?: string | null;
  durationMonths: number;
  startDate: string;
  endDate?: string | null;
  status: string;
  suggestedPremium?: number | null;
  approvedPremium?: number | null;
  owner?: string;
  coverLimit?: number | null;
  excess?: number | null;
  exclusions?: string[] | null;
  wordingVersion?: string | null;
};

export type Claim = {
  id: string;
  owner: string;
  claimNumber?: string | null;
  policeCaseNumber?: string | null;
  incidentLocation?: string | null;
  policyId: string;
  assetId: string;
  claimType: string;
  description?: string;
  incidentDate: string;
  amountRequested?: number | null;
  status: string;
  tier?: number | null;
  riskScore?: number | null;
  fraudFlag?: boolean | null;
  fraudReason?: string | null;
  suggestedPayout?: number | null;
  approvedPayout?: number | null;
  assignedOfficerId?: string | null;
  approvedBy?: string | null;
  currentMilestone?: string | null;
  submittedAt?: string | null;
  closedAt?: string | null;
  lastActivityAt?: string | null;
  assignmentDueAt?: string | null;
};

export type ClaimDocument = {
  id: string;
  claimId: string;
  objectKey?: string;
  fileName: string;
  mediaType: string;
  byteSize: number;
  status: string;
  category?: string | null;
  visibility?: string | null;
};

export type ClaimAssignment = {
  id: string; claimId: string; userSubject: string; userDisplayNameSnapshot: string;
  userRoleSnapshot: string; assignmentRole: string; isLead: boolean; active: boolean;
  assignedAt: string; endedAt?: string | null;
};
export type ClaimAssessment = {
  id: string; claimId: string; version: number; evidenceReviewed: string[];
  coveredLossValue: number; repairEstimate?: number | null; replacementEstimate?: number | null;
  policyLimit: number; excess: number; depreciation: number; exclusions: string[];
  recommendedPayout: number; status: string; overrideReason?: string | null;
  assessorSubject?: string; assessorDisplayNameSnapshot?: string; createdAtSnapshot?: string; finalizedAt?: string | null; finalizedBySubject?: string | null;
  submittedAt?: string | null; submissionNote?: string | null;
};

export type RiskFactor = { name: string; applied: boolean; weight: number; reason: string };
export type FraudSignal = { signalName: string; triggered: boolean; severity: string; details: string };
/** Deterministic checks plus the advisory AI summary stored for a claim (senior-readable). */
export type ClaimAnalysis = {
  id: string; claimId: string; version: number; aiSummary?: string | null; recommendation?: string | null;
  inconsistencies?: string[] | null; missingInformation?: string[] | null; warnings?: string[] | null;
  confidence?: number | null; modelId?: string | null; inferenceStatus: string;
  deterministicOutputs?: { tier?: { tier: number }; risk?: { totalRiskScore: number; riskLevel: string; factors: RiskFactor[] }; fraud?: { isFlagged: boolean; overallRisk: string; recommendation: string; signals: FraudSignal[] } } | null;
};

export type ProcessingJob = {
  id: string; claimId: string; status: string; currentStep?: string | null; attempts?: number | null;
  errorCategory?: string | null; errorMessage?: string | null; startedAt?: string | null; completedAt?: string | null; createdAt?: string;
};

export type ClaimActivity = {
  id: string; claimId: string; eventId: string; eventType: string; milestone: string;
  actorDisplayNameSnapshot: string; actorRoleSnapshot: string; summary: string;
  detail?: string | null; visibility: string; occurredAt: string;
};

export type ClaimCommunication = {
  id: string; claimId: string; channel: string; direction: string; subject?: string | null;
  body: string; senderDisplayNameSnapshot: string; senderRoleSnapshot: string;
  deliveryState: string; occurredAt: string;
};

export type ClaimInternalNote = {
  id: string; claimId: string; authorDisplayNameSnapshot: string; authorRoleSnapshot: string;
  body: string; occurredAt: string;
};

export type Profile = {
  id: string;
  owner: string;
  email: string;
  displayName?: string | null;
  businessRole: string;
  status: string;
};

export type Portfolio = {
  assets: Asset[];
  policies: Policy[];
  applications: PolicyApplication[];
  premiumAssessments: PremiumAssessment[];
  claims: Claim[];
  documents: ClaimDocument[];
  assignments: ClaimAssignment[];
  activities: ClaimActivity[];
  communications: ClaimCommunication[];
  internalNotes: ClaimInternalNote[];
  claimAssessments: ClaimAssessment[];
  analyses: ClaimAnalysis[];
  jobs: ProcessingJob[];
  profiles: Profile[];
  profile: Profile | null;
};
