import { useState } from 'react';
import { SENIOR_APPROVAL_LIMIT, assertDecisionAuthority } from '../../amplify/functions/claims-command/domain';
import { CaseDrawer, CaseFile } from '../components/CaseFile';
import { ConfirmModal } from '../components/ConfirmModal';
import { PayoutBreakdown } from '../components/PayoutBreakdown';
import { ClaimTable, EmptyState, Field, PageHeader, Status } from '../components/ui';
import { client } from '../lib/data';
import { daysSince, dateTime, money, titleCase } from '../lib/format';
import { analysisFor, assetLabel, clientName, latestAssessment } from '../lib/portfolio';
import { roleFlags } from '../lib/roles';
import { riskLevel } from '../lib/status';
import type { Claim, ClaimAnalysis, ClaimAssessment, Portfolio } from '../types';

type Props = { portfolio: Portfolio; groups: string[]; owner: string; refresh: () => Promise<void>; notify: (message: string) => void };
type Queue = 'decide' | 'finalise';
const keys = () => ({ idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() });

/** Review queue. Seniors finalise submitted assessments and decide claims; officers follow their own submissions. */
export function ReviewPage(props: Props) {
  const access = roleFlags(props.groups);
  return access.isSenior ? <SeniorReview {...props} /> : <Submissions {...props} />;
}

function SeniorReview({ portfolio, groups, owner, refresh, notify }: Props) {
  const access = roleFlags(groups);
  const decide = portfolio.claims.filter((claim) => claim.status === 'DECISION_PENDING');
  const finalise = portfolio.claims.filter((claim) => claim.status === 'UNDER_ASSESSMENT' && latestAssessment(portfolio, claim.id)?.status === 'SUBMITTED');
  const [queue, setQueue] = useState<Queue>(decide.length || !finalise.length ? 'decide' : 'finalise');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = queue === 'decide' ? decide : finalise;
  const active = list.find((claim) => claim.id === selectedId) ?? list[0] ?? null;
  const pick = (next: Queue) => { setQueue(next); setSelectedId(null); };

  return <>
    <PageHeader eyebrow="Human decision gate" title="Review with context." description="Check the evidence, the calculation and the risk signals side by side before you decide. The AI summary and the figures support you; they never decide for you." />
    <div className="filter-tabs" role="tablist" aria-label="Review queues">
      <button role="tab" aria-selected={queue === 'decide'} className={queue === 'decide' ? 'active' : ''} onClick={() => pick('decide')}>Awaiting decision <b>{decide.length}</b></button>
      <button role="tab" aria-selected={queue === 'finalise'} className={queue === 'finalise' ? 'active' : ''} onClick={() => pick('finalise')}>Awaiting finalisation <b>{finalise.length}</b></button>
    </div>
    {!list.length ? <EmptyState title={queue === 'decide' ? 'No claims are waiting for a decision' : 'No assessments are waiting to be finalised'} copy={queue === 'decide' ? 'Claims appear here once a senior officer has finalised an evidence assessment.' : 'Assessments appear here when an officer sends one for senior review.'} /> : <>
      <div className="queue-chips" role="listbox" aria-label="Claims in this queue">{list.map((claim) => <button role="option" aria-selected={claim.id === active?.id} className={claim.id === active?.id ? 'active' : ''} onClick={() => setSelectedId(claim.id)} key={claim.id}>
        <strong>{claim.claimNumber}</strong><span>{clientName(portfolio, claim.owner)} · {titleCase(claim.claimType)}</span><small>{money.format(claim.suggestedPayout ?? latestAssessment(portfolio, claim.id)?.recommendedPayout ?? 0)} · waiting {daysSince(claim.lastActivityAt)} d{claim.fraudFlag ? ' · ⚑ flagged' : ''}</small></button>)}</div>
      {active && <div className="review-split">
        <div className="review-case"><CaseFile key={active.id} claim={active} portfolio={portfolio} owner={owner} access={access} refresh={refresh} notify={notify} embedded /></div>
        <div className="review-side">{queue === 'decide'
          ? <DecisionPanel key={active.id} claim={active} portfolio={portfolio} groups={groups} owner={owner} refresh={refresh} notify={notify} />
          : <FinalisePanel key={active.id} claim={active} portfolio={portfolio} refresh={refresh} notify={notify} />}</div>
      </div>}
    </>}
  </>;
}

function RiskAndAi({ analysis, claim }: { analysis?: ClaimAnalysis; claim: Claim }) {
  const out = analysis?.deterministicOutputs;
  if (!analysis) return <section className="review-block"><h3>Risk signals and AI summary</h3><p className="empty">No analysis has been recorded for {claim.claimNumber}. Decide from the evidence and the calculation above.</p></section>;
  const signals = out?.fraud?.signals ?? [];
  return <>
    <section className="review-block"><h3>Rule-based checks</h3>
      <p className="muted">Fixed rules, not AI. {out?.fraud ? `Overall: ${titleCase(out.fraud.overallRisk)}. ${out.fraud.recommendation}.` : ''}</p>
      <ul className="signal-list">{signals.map((item) => <li className={item.triggered ? 'triggered' : ''} key={item.signalName}><b>{item.triggered ? '⚑' : '✓'}</b><span><strong>{item.signalName}{item.triggered && <em>{titleCase(item.severity)} severity</em>}</strong><small>{item.details}</small></span></li>)}</ul>
      {out?.risk && <><h4>Risk factors · {titleCase(riskLevel(out.risk.totalRiskScore))} ({out.risk.totalRiskScore.toFixed(2)})</h4><ul className="signal-list">{out.risk.factors.filter((item) => item.applied).map((item) => <li key={item.name}><b>{item.weight > 0 ? '+' : '−'}</b><span><strong>{item.name} ({item.weight > 0 ? '+' : ''}{item.weight})</strong><small>{item.reason}</small></span></li>)}</ul></>}
    </section>
    <section className="review-block ai"><h3><span className="ai-tag">AI</span> Advisory summary</h3>
      <p className="muted">Advisory only. It is written from the claim record and has not read the uploaded evidence files, so check the documents yourself.</p>
      {analysis.aiSummary && <p>{analysis.aiSummary}</p>}
      {analysis.recommendation && <p><strong>Suggested approach:</strong> {analysis.recommendation}</p>}
      {!!analysis.inconsistencies?.length && <><h4>Possible inconsistencies</h4><ul>{analysis.inconsistencies.map((item) => <li key={item}>{item}</li>)}</ul></>}
      {!!analysis.missingInformation?.length && <><h4>Information that is missing</h4><ul>{analysis.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul></>}
      {analysis.confidence != null && <small>Model confidence {Math.round(analysis.confidence * 100)}%</small>}
    </section>
  </>;
}

function authorityProblem(claim: Claim, payout: number, assessment: ClaimAssessment | undefined, owner: string, groups: string[]) {
  try {
    assertDecisionAuthority({ actorSubject: owner, actorGroups: groups, claimOwner: claim.owner, payout, assessment });
    return null;
  } catch (error) { return error instanceof Error ? error.message : 'You cannot decide this claim.'; }
}

function DecisionPanel({ claim, portfolio, groups, owner, refresh, notify }: { claim: Claim } & Omit<Props, 'portfolio'> & { portfolio: Portfolio }) {
  const access = roleFlags(groups);
  const assessment = portfolio.claimAssessments.filter((item) => item.claimId === claim.id && ['FINALIZED', 'FINAL'].includes(item.status)).sort((a, b) => b.version - a.version)[0];
  const suggested = claim.suggestedPayout ?? assessment?.recommendedPayout ?? 0;
  const ceiling = Math.min(assessment?.policyLimit ?? Infinity, access.isSuperuser ? Infinity : SENIOR_APPROVAL_LIMIT);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const entered = amount.trim() === '' ? null : Number(amount);
  const different = entered !== null && entered !== suggested;
  const amountError = entered === null ? null
    : !Number.isFinite(entered) || entered < 0 ? 'Enter a valid amount.'
    : assessment && entered > assessment.policyLimit ? `The payout cannot exceed the policy limit of ${money.format(assessment.policyLimit)}.` : null;
  const check = entered !== null && !amountError ? authorityProblem(claim, entered, assessment, owner, groups) : authorityProblem(claim, 0, assessment, owner, groups);
  const needsSuperuser = (entered ?? suggested) > SENIOR_APPROVAL_LIMIT && !access.isSuperuser;
  const reasonMissing = different && reason.trim().length < 5;
  const canApprove = entered !== null && !amountError && !check && !reasonMissing;
  const superusers = portfolio.profiles.filter((item) => item.businessRole === 'superuser' && item.status === 'active');

  async function decide(action: 'approve' | 'reject', values: Record<string, string>) {
    const result = action === 'approve'
      ? await client.mutations.approveClaim({ claimId: claim.id, approvedPayout: entered, overrideReason: different ? reason.trim() : undefined, ...keys() })
      : await client.mutations.rejectClaim({ claimId: claim.id, reason: values.reason, ...keys() });
    if (result.errors?.length) { notify(result.errors[0].message); return; }
    setDialog(null);
    notify(`Claim ${claim.claimNumber} ${action === 'approve' ? 'approved' : 'rejected'}. The decision is on the audit trail.`);
    await refresh();
  }
  async function escalate() {
    const target = superusers[0];
    if (!target) return notify('No active superuser is available to escalate to.');
    const result = await client.mutations.assignClaimTeamMember({ claimId: claim.id, userSubject: target.owner, displayName: target.displayName || target.email, userRole: target.businessRole, assignmentRole: 'SUPERVISOR', isLead: false, ...keys() });
    if (result.errors?.length) notify(result.errors[0].message); else { notify(`Escalated to ${target.displayName || target.email}. They can now decide this claim.`); await refresh(); }
  }

  return <>
    <section className="review-block">
      <span className="eyebrow">{claim.claimNumber} · {assetLabel(portfolio, claim)}</span>
      <h2>Make the decision</h2>
      {assessment ? <PayoutBreakdown input={assessment} title="How the assessed payout was reached" /> : <p className="empty">No finalised assessment is on record, so a decision cannot be made yet.</p>}
      <p className="muted">Prepared by {assessment?.assessorDisplayNameSnapshot ?? 'an officer'}{assessment?.submissionNote ? ` · “${assessment.submissionNote}”` : ''}</p>
      <div className="decision-amount"><span>Assessed payout</span><strong>{money.format(suggested)}</strong><small>Limit for you: {Number.isFinite(ceiling) ? money.format(ceiling) : 'policy limit'}{access.isSuperuser ? '' : ` · above ${money.format(SENIOR_APPROVAL_LIMIT)} needs a superuser`}</small></div>
      <Field label="Approved payout (ZAR)" hint="Type the amount you are approving, or use the assessed amount."><input type="number" min="0" max={Number.isFinite(ceiling) ? ceiling : undefined} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Enter an amount" aria-invalid={Boolean(amountError)} /></Field>
      <button type="button" className="text-button" onClick={() => setAmount(String(suggested))}>Use the assessed amount ({money.format(suggested)})</button>
      {amountError && <p className="form-error" role="alert">{amountError}</p>}
      {different && <Field label="Why does this differ from the assessed amount? (required)" hint="This goes on the audit trail."><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="e.g. Prior damage to the bumper was not in the repair quote" /></Field>}
      {check && <p className="form-error" role="alert">{check}</p>}
      {needsSuperuser && !check?.includes('finalized') && <div className="escalate"><p>This payout is above {money.format(SENIOR_APPROVAL_LIMIT)}. Only a superuser can approve it.</p><button className="secondary" onClick={escalate} disabled={!superusers.length}>Escalate to a superuser</button></div>}
      <div className="decision-actions"><button className="reject-button" disabled={Boolean(authorityProblem(claim, 0, assessment, owner, groups))} onClick={() => setDialog('reject')}>Reject with reason</button><button className="primary" disabled={!canApprove} onClick={() => setDialog('approve')}>Review and approve</button></div>
    </section>
    <RiskAndAi analysis={analysisFor(portfolio, claim.id)} claim={claim} />
    {dialog === 'approve' && entered !== null && <ConfirmModal title={`Approve ${money.format(entered)}?`} description="This approves the payout and tells the client. It cannot be undone." confirmLabel="Approve payout" onCancel={() => setDialog(null)} onConfirm={(values) => decide('approve', values)}
      summary={<dl className="confirm-facts"><div><dt>Claim</dt><dd>{claim.claimNumber} · {clientName(portfolio, claim.owner)}</dd></div><div><dt>Assessed</dt><dd>{money.format(suggested)}</dd></div><div><dt>Approving</dt><dd><strong>{money.format(entered)}</strong></dd></div>{different && <div><dt>Reason for the difference</dt><dd>{reason}</dd></div>}</dl>} />}
    {dialog === 'reject' && <ConfirmModal title={`Reject ${claim.claimNumber}?`} description="The client will see your reason on their case timeline." tone="danger" confirmLabel="Reject claim" fields={[{ name: 'reason', label: 'Reason shown to the client', hint: 'Be clear and specific (at least 5 characters).', type: 'textarea', required: true, minLength: 5, placeholder: 'e.g. The damage occurred before the policy start date.' }]} onCancel={() => setDialog(null)} onConfirm={(values) => decide('reject', values)} />}
  </>;
}

function FinalisePanel({ claim, portfolio, refresh, notify }: { claim: Claim; portfolio: Portfolio; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const assessment = latestAssessment(portfolio, claim.id);
  const [open, setOpen] = useState(false);
  if (!assessment) return null;
  async function finalise() {
    const result = await client.mutations.finalizeClaimPayoutAssessment({ assessmentId: assessment!.id, ...keys() });
    if (result.errors?.length) { notify(result.errors[0].message); return; }
    setOpen(false); notify('Assessment finalised. The claim now awaits a decision by another senior officer.'); await refresh();
  }
  return <>
    <section className="review-block">
      <span className="eyebrow">{claim.claimNumber} · {assetLabel(portfolio, claim)}</span>
      <h2>Finalise the assessment</h2>
      <p className="muted">Sent for review by {assessment.assessorDisplayNameSnapshot ?? 'an officer'}{assessment.submittedAt ? ` · ${dateTime(assessment.submittedAt)}` : ''}.</p>
      {assessment.submissionNote && <blockquote>{assessment.submissionNote}</blockquote>}
      <PayoutBreakdown input={assessment} title="The assessment to finalise" />
      <p className="muted">Finalising moves the claim to a decision. You will not be able to decide a claim you have finalised, so another senior officer takes it from here.</p>
      <div className="decision-actions"><button className="primary" onClick={() => setOpen(true)}>Finalise assessment</button></div>
    </section>
    <RiskAndAi analysis={analysisFor(portfolio, claim.id)} claim={claim} />
    {open && <ConfirmModal title="Finalise this assessment?" description="The claim goes to a decision. You cannot also decide it." confirmLabel="Finalise" summary={<PayoutBreakdown input={assessment} />} onCancel={() => setOpen(false)} onConfirm={finalise} />}
  </>;
}

/** What junior and intermediate officers see: where their own assessments stand, and who acts next. */
function Submissions({ portfolio, groups, owner, refresh, notify }: Props) {
  const access = roleFlags(groups);
  const [selected, setSelected] = useState<Claim | null>(null);
  const mine = portfolio.claims.filter((claim) => latestAssessment(portfolio, claim.id)?.assessorSubject === owner);
  const waiting = mine.filter((claim) => ['DRAFT', 'SUBMITTED'].includes(latestAssessment(portfolio, claim.id)?.status ?? ''));
  const next = (claim: Claim) => {
    const assessment = latestAssessment(portfolio, claim.id)!;
    if (assessment.status === 'DRAFT') return 'You: send the draft for senior review on the case.';
    if (assessment.status === 'SUBMITTED') return 'A senior officer is reviewing it.';
    if (claim.status === 'DECISION_PENDING') return 'A different senior officer is making the decision.';
    return titleCase(claim.status);
  };
  return <>
    <PageHeader eyebrow="Your submissions" title="Where your assessments stand." description="Officers prepare assessments; senior officers finalise them and decide claims. This page follows the work you have sent up and tells you who acts next." />
    <div className="info-callout"><strong>Why you cannot approve or reject here</strong><p>Decisions need a senior officer who did not prepare or finalise the assessment. This keeps payouts independent and auditable.</p></div>
    {!mine.length ? <EmptyState title="You have not prepared any assessments yet" copy="Open one of your cases, review the evidence and calculate a payout assessment on the Private notes tab. It will appear here once you do." /> : <section className="panel table-panel"><div className="table-wrap"><table className="claim-table"><thead><tr><th>Claim</th><th>Client</th><th>Your assessment</th><th>Status</th><th>What happens next</th><th /></tr></thead><tbody>{mine.map((claim) => {
      const assessment = latestAssessment(portfolio, claim.id)!;
      return <tr key={claim.id} className="clickable" onClick={() => setSelected(claim)}><td><strong>{claim.claimNumber}</strong><small>{assetLabel(portfolio, claim)}</small></td><td>{clientName(portfolio, claim.owner)}</td><td><strong>v{assessment.version} · {money.format(assessment.recommendedPayout)}</strong><small>{titleCase(assessment.status === 'FINALIZED' ? 'finalised' : assessment.status)}</small></td><td><Status value={claim.status} /></td><td>{next(claim)}</td><td><button className="text-button">Open →</button></td></tr>;
    })}</tbody></table></div></section>}
    {waiting.length > 0 && <p className="muted">{waiting.length} of your assessments {waiting.length === 1 ? 'is' : 'are'} still with you or waiting for a senior officer.</p>}
    {!mine.length && portfolio.claims.length > 0 && <section className="panel table-panel"><div className="panel-title"><div><span className="eyebrow">Your cases</span><h2>Cases without an assessment yet</h2></div></div><ClaimTable claims={portfolio.claims} onSelect={setSelected} access={access} portfolio={portfolio} /></section>}
    {selected && <CaseDrawer claim={portfolio.claims.find((item) => item.id === selected.id) ?? selected} portfolio={portfolio} owner={owner} access={access} onClose={() => setSelected(null)} refresh={refresh} notify={notify} />}
  </>;
}
