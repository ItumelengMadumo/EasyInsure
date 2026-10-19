// Lookups over a loaded Portfolio, shared by every list and detail screen.
import type { Asset, Claim, ClaimAssignment, Policy, Portfolio } from '../types';

export const clientName = (portfolio: Portfolio, owner?: string | null) =>
  !owner || owner === 'redacted' ? 'Client' : portfolio.profiles.find((profile) => profile.owner === owner)?.displayName || 'Client';

export const leadAdvisor = (portfolio: Portfolio, claimId: string): ClaimAssignment | undefined =>
  portfolio.assignments.find((item) => item.claimId === claimId && item.active && item.isLead);

export const assetOf = (portfolio: Portfolio, claim: Pick<Claim, 'assetId'>): Asset | undefined =>
  portfolio.assets.find((item) => item.id === claim.assetId);

export const policyOf = (portfolio: Portfolio, claim: Pick<Claim, 'policyId'>): Policy | undefined =>
  portfolio.policies.find((item) => item.id === claim.policyId);

export const assetLabel = (portfolio: Portfolio, claim: Pick<Claim, 'assetId'>) =>
  assetOf(portfolio, claim)?.description || 'Insured asset';

/** The assessment an officer is currently working on or has sent up, newest first. */
export const latestAssessment = (portfolio: Portfolio, claimId: string) =>
  portfolio.claimAssessments.filter((item) => item.claimId === claimId).sort((a, b) => b.version - a.version)[0];

export const analysisFor = (portfolio: Portfolio, claimId: string) =>
  portfolio.analyses.filter((item) => item.claimId === claimId).sort((a, b) => b.version - a.version)[0];

/** Initials for an avatar, from the same rule everywhere. */
export { initials } from './format';
