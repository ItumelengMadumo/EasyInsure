// "What can I do now?" for a claim, from one function, so the case file never leaves an officer
// guessing and never offers a client an action that belongs to staff.
import { clientStatus } from './status';
import type { Access } from './roles';
import type { Claim, ClaimAssessment } from '../types';

export type StepContext = { assessments: ClaimAssessment[]; owner: string };

export function nextSteps(claim: Claim, access: Access, { assessments, owner }: StepContext): { heading: string; items: string[] } {
  if (access.isClient) {
    const info = clientStatus(claim.status);
    return { heading: info.label, items: [info.next] };
  }
  if (access.isDeveloper) return { heading: 'Read-only diagnostics', items: ['You can inspect this case but cannot change it or decide it.'] };

  const latest = [...assessments].sort((a, b) => b.version - a.version)[0];
  const mine = latest?.assessorSubject === owner;
  const { isSenior, canOperate } = access;
  switch (claim.status) {
    case 'ASSIGNMENT_PENDING': return { heading: 'Waiting for an advisor', items: [isSenior ? 'Add a lead advisor on the Case team tab.' : 'A senior officer will assign a lead advisor.'] };
    case 'VALIDATING': return { heading: 'Ready to start', items: [canOperate ? 'Check that the police affidavit is clean, then start the assessment.' : 'The lead advisor starts the assessment once evidence is checked.'] };
    case 'INFO_NEEDED': return { heading: 'Waiting on the client', items: ['The assessment resumes when the client replies. You can still message them or add private notes.'] };
    case 'UNDER_ASSESSMENT': {
      if (!canOperate) return { heading: 'Under assessment', items: ['The assigned officers are working this case.'] };
      if (!latest) return { heading: 'Assess the claim', items: ['Review the evidence, then calculate a payout assessment on the Private notes tab.', 'Ask the client for anything missing with the information request box on the timeline.'] };
      if (latest.status === 'DRAFT') return { heading: 'Draft assessment', items: [mine || isSenior ? 'Check the breakdown, then send your assessment for senior review.' : 'The officer who prepared this assessment sends it for review.'] };
      if (latest.status === 'SUBMITTED') return { heading: 'With a senior officer', items: [isSenior ? 'Review the submitted assessment and finalise it so a decision can be made.' : 'A senior officer is reviewing your assessment. You will see the case move to Decision pending.'] };
      return { heading: 'Under assessment', items: ['Continue the assessment.'] };
    }
    case 'DECISION_PENDING': return { heading: 'Awaiting decision', items: [isSenior ? 'Open the Review queue to approve or reject. You cannot decide a case you assessed or finalised.' : 'A senior officer will approve or reject this claim.'] };
    case 'APPROVED': return { heading: 'Approved', items: [canOperate ? 'Prepare the payment.' : 'Payment will be prepared.'] };
    case 'PAYMENT_PENDING': return { heading: 'Payment pending', items: [isSenior ? 'Record the bank or EFT reference once the payout has been made.' : 'A senior officer records the payout once it has been made.'] };
    case 'PAID': case 'REJECTED': return { heading: claim.status === 'PAID' ? 'Paid' : 'Rejected', items: [isSenior ? 'Close the case to finish it.' : 'A senior officer closes the case.'] };
    case 'CLOSED': return { heading: 'Closed', items: ['This case is closed.'] };
    default: return { heading: 'In progress', items: [] };
  }
}
