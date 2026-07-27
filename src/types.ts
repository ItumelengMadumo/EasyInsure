export type Page =
  | 'overview'
  | 'personaLab'
  | 'assets'
  | 'policies'
  | 'claims'
  | 'documents'
  | 'review'
  | 'profile';

export type BusinessRole =
  | 'client'
  | 'junior_officer'
  | 'intermediate_officer'
  | 'senior_officer'
  | 'developer'
  | 'superuser';

export type PersonaCapabilities = {
  visiblePages: Page[];
  isClient: boolean;
  isStaff: boolean;
  canOperateClaims: boolean;
  canAssessClaims: boolean;
  canReviewUnderwriting: boolean;
  canDecideClaims: boolean;
  canViewAllClaims: boolean;
  canViewInternalRecords: boolean;
};

export type SimulationScenarioId =
  | 'golden-journey' | 'empty-client' | 'asset-application' | 'underwriting-info'
  | 'quote-acceptance' | 'active-cover' | 'claim-draft' | 'claim-unassigned'
  | 'affidavit-scan' | 'junior-validation' | 'information-loop' | 'claim-assessment'
  | 'senior-decision' | 'failed-communication' | 'payment-pending' | 'closed-claim'
  | 'suspended-account' | 'access-denied' | 'role-conflict';

export type WorkspaceSession = {
  authenticatedRole: BusinessRole;
  effectiveRole: BusinessRole;
  mode: 'live' | 'simulation';
  scenario: SimulationScenarioId | null;
  capabilities: PersonaCapabilities;
};

export type SimulationCommand = {
  kind: 'mutation' | 'model' | 'query';
  operation: string;
  model?: string;
  args: Record<string, unknown>;
};

export type SimulationEvent = {
  id: string;
  operation: string;
  occurredAt: string;
  actorRole: BusinessRole;
};

export type WorkspaceAdapter = {
  mode: 'live' | 'simulation';
  execute(command: SimulationCommand): Promise<{ data?: any; errors?: Array<{ message: string }> }>;
};

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
};

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
};

export type Claim = {
  id: string;
  owner: string;
  claimNumber?: string | null;
  policeCaseNumber?: string | null;
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
  currentMilestone?: string | null;
  submittedAt?: string | null;
  closedAt?: string | null;
  lastActivityAt?: string | null;
};

export type ClaimDocument = {
  id: string;
  claimId: string;
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
  profiles: Profile[];
  profile: Profile | null;
};
