// What each officer needs to do next, derived from the portfolio they can see. Pure and tested so
// the dashboard, the admin reports and the tests all agree on what "overdue" and "needs action" mean.
import { daysSince } from './format';
import { latestAssessment } from './portfolio';
import type { Access } from './roles';
import type { Claim, Page, Portfolio, PolicyApplication } from '../types';

/** Internal service targets used to flag work as overdue. The assignment target mirrors the backend (15 minutes). */
export const SLA = { infoNeededDays: 5, assessmentDays: 7, decisionDays: 3, paymentDays: 3 };
const FINISHED = ['PAID', 'CLOSED', 'REJECTED'];

export type WorkItem = {
  id: string; claim?: Claim; application?: PolicyApplication; action: string; reason: string; page: Page; ageDays: number; overdue: boolean;
};
export type WorkQueue = {
  items: WorkItem[]; byStatus: Record<string, number>; open: number; waitingOnClient: number; oldestOpenDays: number; overdue: number;
};

export function buildWorkQueue(portfolio: Portfolio, access: Access, owner: string, now = Date.now()): WorkQueue {
  const open = portfolio.claims.filter((claim) => !FINISHED.includes(claim.status) && claim.status !== 'DRAFT' && claim.status !== 'CLOSED');
  const byStatus: Record<string, number> = {};
  open.forEach((claim) => { byStatus[claim.status] = (byStatus[claim.status] ?? 0) + 1; });
  const items: WorkItem[] = [];
  const add = (claim: Claim, action: string, reason: string, page: Page, limitDays?: number) => {
    const ageDays = daysSince(claim.lastActivityAt ?? claim.submittedAt, now);
    items.push({ id: `${claim.id}:${action}`, claim, action, reason, page, ageDays, overdue: limitDays !== undefined && ageDays > limitDays });
  };

  if (access.canOperate) {
    for (const claim of portfolio.claims) {
      const latest = latestAssessment(portfolio, claim.id);
      const mine = latest?.assessorSubject === owner || access.isSenior;
      switch (claim.status) {
        case 'ASSIGNMENT_PENDING':
          if (access.isSenior) {
            const overdue = claim.assignmentDueAt ? Date.parse(claim.assignmentDueAt) < now : false;
            items.push({ id: `${claim.id}:assign`, claim, action: 'Assign a lead advisor', reason: 'The claim has no lead advisor yet.', page: 'claims', ageDays: daysSince(claim.submittedAt, now), overdue });
          }
          break;
        case 'VALIDATING': add(claim, 'Start the assessment', 'Evidence is checked and the case is ready to assess.', 'claims', SLA.assessmentDays); break;
        case 'UNDER_ASSESSMENT':
          if (!latest) add(claim, 'Prepare a payout assessment', 'Review the evidence and calculate a recommendation.', 'claims', SLA.assessmentDays);
          else if (latest.status === 'DRAFT' && mine) add(claim, 'Send your assessment for senior review', 'A draft assessment is waiting to be sent.', 'claims', SLA.assessmentDays);
          else if (latest.status === 'SUBMITTED' && access.isSenior) add(claim, 'Finalise the submitted assessment', 'An officer has sent an assessment for review.', 'review', SLA.decisionDays);
          break;
        case 'INFO_NEEDED':
          if (daysSince(claim.lastActivityAt, now) >= SLA.infoNeededDays) add(claim, 'Chase the client', `No reply for ${daysSince(claim.lastActivityAt, now)} days.`, 'claims', SLA.infoNeededDays);
          break;
        case 'DECISION_PENDING': {
          const finalised = portfolio.claimAssessments.filter((item) => item.claimId === claim.id && ['FINALIZED', 'FINAL'].includes(item.status));
          const conflicted = finalised.some((item) => item.assessorSubject === owner || item.finalizedBySubject === owner);
          if (access.isSenior && !conflicted && claim.owner !== owner) add(claim, 'Decide the claim', 'The assessment is finalised and awaits a decision.', 'review', SLA.decisionDays);
          break;
        }
        case 'APPROVED': add(claim, 'Prepare the payment', 'The payout is approved.', 'claims', SLA.paymentDays); break;
        case 'PAYMENT_PENDING': if (access.isSenior) add(claim, 'Record the payout', 'Payment is being made.', 'claims', SLA.paymentDays); break;
        case 'PAID': case 'REJECTED': if (access.isSenior) add(claim, 'Close the case', 'The outcome is final.', 'claims'); break;
        default: break;
      }
    }
    if (access.isSenior) {
      for (const application of portfolio.applications) {
        const age = daysSince(application.submittedAt ?? application.lastUpdatedAt, now);
        if (application.status === 'SUBMITTED') items.push({ id: `${application.id}:review`, application, action: 'Begin the underwriting review', reason: 'A new application is waiting.', page: 'policies', ageDays: age, overdue: age > SLA.assessmentDays });
        if (application.status === 'UNDER_REVIEW') items.push({ id: `${application.id}:quote`, application, action: 'Issue a formal quote', reason: 'The application is under review.', page: 'policies', ageDays: age, overdue: age > SLA.assessmentDays });
      }
    }
  }
  items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.ageDays - a.ageDays);
  return {
    items, byStatus, open: open.length, waitingOnClient: open.filter((claim) => claim.status === 'INFO_NEEDED').length,
    oldestOpenDays: open.reduce((oldest, claim) => Math.max(oldest, daysSince(claim.submittedAt, now)), 0), overdue: items.filter((item) => item.overdue).length,
  };
}
