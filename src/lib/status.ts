// Status wording and state models shared by every screen, so the same fact is never described
// two different ways (the badge, the progress tracker and the next-step text all come from here).
import { titleCase } from './format';
import type { Asset, Policy, PolicyApplication } from '../types';

export const CLAIM_MILESTONES = ['SUBMITTED', 'VALIDATING', 'UNDER_ASSESSMENT', 'DECISION_PENDING', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'CLOSED'];

type ClientStatus = { label: string; next: string; tone: 'info' | 'action' | 'good' | 'bad' | 'muted' };
const CLIENT_STATUS: Record<string, ClientStatus> = {
  DRAFT: { label: 'Draft', next: 'Finish and submit your claim.', tone: 'muted' },
  SUBMITTED: { label: 'Received', next: 'We are assigning an advisor to your claim.', tone: 'info' },
  ASSIGNMENT_PENDING: { label: 'Received', next: 'We are assigning an advisor to your claim.', tone: 'info' },
  VALIDATING: { label: 'Checking your documents', next: 'We are checking your evidence. You do not need to do anything yet.', tone: 'info' },
  UNDER_ASSESSMENT: { label: 'Under assessment', next: 'An advisor is reviewing your evidence and may contact you.', tone: 'info' },
  INFO_NEEDED: { label: 'Waiting on you', next: 'Your advisor needs more information. Reply on the case to continue.', tone: 'action' },
  DECISION_PENDING: { label: 'Awaiting decision', next: 'A senior officer is making the final decision.', tone: 'info' },
  APPROVED: { label: 'Approved', next: 'Your payout is being prepared.', tone: 'good' },
  PAYMENT_PENDING: { label: 'Payment being prepared', next: 'Your payout is being processed.', tone: 'good' },
  PAID: { label: 'Paid', next: 'Your payout has been made.', tone: 'good' },
  REJECTED: { label: 'Not approved', next: 'The reason is on your case timeline.', tone: 'bad' },
  CLOSED: { label: 'Closed', next: 'This case is closed.', tone: 'muted' },
  FAILED: { label: 'Under review', next: 'We hit a problem and are looking into it.', tone: 'info' },
};
export const clientStatus = (status: string): ClientStatus =>
  CLIENT_STATUS[status] ?? { label: titleCase(status), next: '', tone: 'info' };

/** Claims that need the client to do something. */
export const waitingOnClient = (status: string) => status === 'INFO_NEEDED';

// Where each status sits on the progress tracker. INFO_NEEDED and REJECTED are not steps of their
// own: they pause or end the step they interrupt, so the tracker never contradicts the badge.
const TRACKER_STEP: Record<string, number> = {
  DRAFT: 0, SUBMITTED: 0, ASSIGNMENT_PENDING: 0, VALIDATING: 1, FAILED: 1, UNDER_ASSESSMENT: 2, INFO_NEEDED: 2,
  DECISION_PENDING: 3, REJECTED: 3, APPROVED: 4, PAYMENT_PENDING: 5, PAID: 6, CLOSED: 7,
};
export function trackerPosition(status: string, recordedMilestones: string[] = []) {
  const recorded = recordedMilestones.map((item) => CLAIM_MILESTONES.indexOf(item)).filter((index) => index >= 0);
  return Math.max(TRACKER_STEP[status] ?? 0, 0, ...recorded);
}

export type CoverState = 'COVERED' | 'QUOTE_READY' | 'IN_UNDERWRITING' | 'MORE_INFO' | 'SUBMITTED' | 'DRAFT' | 'DECLINED' | 'NOT_COVERED';
export const COVER_STATES: { value: CoverState; label: string }[] = [
  { value: 'COVERED', label: 'Covered by an active policy' },
  { value: 'QUOTE_READY', label: 'Quote ready to accept' },
  { value: 'IN_UNDERWRITING', label: 'In underwriting' },
  { value: 'MORE_INFO', label: 'More information needed' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'DRAFT', label: 'Draft application' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'NOT_COVERED', label: 'Not covered' },
];
export const coverLabel = (state: CoverState) => COVER_STATES.find((item) => item.value === state)?.label ?? titleCase(state);

/** The one answer to "is this asset covered?" used by Assets, Policies and the filters. */
export function coverState(asset: Pick<Asset, 'policyId' | 'status'>, application?: Pick<PolicyApplication, 'status'> | null, policy?: Pick<Policy, 'status'> | null): CoverState {
  if (asset.policyId && (!policy || policy.status === 'ACTIVE')) return 'COVERED';
  switch (application?.status) {
    case 'ACCEPTED': return 'COVERED';
    case 'QUOTED': return 'QUOTE_READY';
    case 'UNDER_REVIEW': return 'IN_UNDERWRITING';
    case 'MORE_INFO_REQUIRED': return 'MORE_INFO';
    case 'SUBMITTED': return 'SUBMITTED';
    case 'DRAFT': return 'DRAFT';
    case 'DECLINED': return 'DECLINED';
    default: return asset.status === 'DECLINED' ? 'DECLINED' : 'NOT_COVERED';
  }
}

/** Engine thresholds (insurance-engine/engines.py): below 0.2 low, 0.6 medium, 1 high, otherwise critical. */
export const riskLevel = (score: number): 'low' | 'medium' | 'high' | 'critical' =>
  score < 0.2 ? 'low' : score < 0.6 ? 'medium' : score < 1 ? 'high' : 'critical';
