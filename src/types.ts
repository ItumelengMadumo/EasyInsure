export type Page =
  | 'overview'
  | 'assets'
  | 'policies'
  | 'claims'
  | 'documents'
  | 'review'
  | 'profile';

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
  claimNumber: string;
  policyId: string;
  assetId: string;
  claimType: string;
  description?: string;
  incidentDate: string;
  amountRequested: number;
  status: string;
  tier?: number | null;
  riskScore?: number | null;
  fraudFlag?: boolean | null;
  fraudReason?: string | null;
  suggestedPayout?: number | null;
  approvedPayout?: number | null;
  assignedOfficerId?: string | null;
};

export type ClaimDocument = {
  id: string;
  claimId: string;
  fileName: string;
  mediaType: string;
  byteSize: number;
  status: string;
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
  claims: Claim[];
  documents: ClaimDocument[];
  profile: Profile | null;
};
