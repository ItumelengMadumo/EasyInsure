import { FormEvent, useMemo, useState } from 'react';
import { Field, Status } from './ui';
import { client } from '../lib/data';
import { money, shortDate, titleCase } from '../lib/format';
import type { Access } from '../lib/roles';
import { useModal } from '../lib/useModal';
import type { Claim, ClaimActivity, ClaimCommunication, Portfolio } from '../types';

const milestones = ['SUBMITTED', 'VALIDATING', 'UNDER_ASSESSMENT', 'DECISION_PENDING', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'CLOSED'];

/** The case file as a modal over the page. */
export function CaseDrawer(props: Parameters<typeof CaseFile>[0]) {
  return <div className="case-backdrop" onClick={props.onClose}><CaseFile {...props} /></div>;
}

export function CaseFile({ claim, portfolio, owner, access, refresh, notify, onClose, embedded = false }: {
  claim: Claim; portfolio: Portfolio; owner: string; access: Access; refresh: () => Promise<void>; notify: (message: string) => void;
  onClose?: () => void; embedded?: boolean;
}) {
  const { isStaff, canOperate, isSenior } = access;
  async function onSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget; const form = new FormData(formElement);
    const result = await client.mutations.sendClaimCommunication({
      claimId: claim.id, channel: String(form.get('channel')), body: String(form.get('body')),
      subject: `Update for ${claim.claimNumber}`, visibility: 'CLIENT_VISIBLE',
      recipients: [claim.owner ?? owner], idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) notify(result.errors[0].message);
    else { formElement.reset(); notify('Message added to the case timeline.'); await refresh(); }
  }
  async function onInternalNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget; const form = new FormData(formElement);
    const result = await client.mutations.addClaimInternalNote({
      claimId: claim.id, body: String(form.get('body')),
      idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) notify(result.errors[0].message);
    else { formElement.reset(); notify('Private case note saved.'); await refresh(); }
  }

  const [tab, setTab] = useState<'timeline' | 'team' | 'documents' | 'internal'>('timeline');
  const activities = portfolio.activities.filter((item) => item.claimId === claim.id);
  const communications = portfolio.communications.filter((item) => item.claimId === claim.id);
  const team = portfolio.assignments.filter((item) => item.claimId === claim.id);
  const documents = portfolio.documents.filter((item) => item.claimId === claim.id);
  const notes = portfolio.internalNotes.filter((item) => item.claimId === claim.id);
  const assessments = portfolio.claimAssessments.filter((item) => item.claimId === claim.id);
  const feed = useMemo(() => [
    ...activities.map((item) => ({ ...item, kind: 'activity' as const })),
    ...communications.map((item) => ({ ...item, kind: 'communication' as const })),
  ].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)), [activities, communications]);
  const recordedIndexes = activities.map((item) => milestones.indexOf(item.milestone)).filter((index) => index >= 0);
  const currentIndex = Math.max(0, ...recordedIndexes);
  const lead = team.find((item) => item.active && item.isLead);
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const profile = portfolio.profiles.find((item) => item.owner === form.get('userSubject'));
    if (!profile) return;
    const result = await client.mutations.assignClaimTeamMember({
      claimId: claim.id, userSubject: profile.owner, displayName: profile.displayName || profile.email,
      userRole: profile.businessRole, assignmentRole: String(form.get('assignmentRole')),
      isLead: form.get('assignmentRole') === 'LEAD_ADVISOR',
      idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Case team updated.'); await refresh(); }
  }
  async function provideInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const result = await client.mutations.provideClaimInformation({
      claimId: claim.id, response: String(form.get('response')),
      idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Information sent to your advisor.'); formElement.reset(); await refresh(); }
  }
  async function runAction(action: string) {
    let result;
    if (action === 'START') result = await client.mutations.startClaimProcessing({
      claimId: claim.id, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    else if (action === 'CLOSE') result = await client.mutations.closeClaim({
      claimId: claim.id, summary: 'The case was closed after its final outcome.',
      idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    else if (action === 'PAID') {
      const paymentReference = window.prompt(`Bank/EFT reference for the ${money.format(claim.approvedPayout ?? 0)} payout:`)?.trim();
      if (!paymentReference) return;
      result = await client.mutations.recordClaimPayout({
        claimId: claim.id, paidAmount: claim.approvedPayout ?? 0, paymentReference, correlationId: crypto.randomUUID(),
      });
    }
    else result = await client.mutations.transitionClaim({
      claimId: claim.id, targetStatus: action,
      summary: action === 'PAYMENT_PENDING' ? 'Your approved payout is being prepared.' : `Claim moved to ${titleCase(action)}.`,
      idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Case progress updated.'); await refresh(); }
  }
  async function requestInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const result = await client.mutations.requestClaimInformation({
      claimId: claim.id, request: String(form.get('request')),
      idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Information request added to the client timeline.'); formElement.reset(); await refresh(); }
  }
  async function logCall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const result = await client.mutations.logClaimCall({
      claimId: claim.id, direction: String(form.get('direction')), participants: [String(form.get('participants'))],
      startedAt: new Date(String(form.get('startedAt'))).toISOString(),
      consentStatus: String(form.get('consentStatus')), outcome: String(form.get('outcome')),
      advisorNotes: String(form.get('advisorNotes')), idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Call logged in the permanent case history.'); formElement.reset(); await refresh(); }
  }
  async function assess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const result = await client.mutations.calculateClaimPayoutAssessment({
      claimId: claim.id, evidenceReviewed: documents.filter((item) => item.status === 'CLEAN').map((item) => item.id),
      coveredLossValue: Number(form.get('coveredLossValue')), repairEstimate: form.get('repairEstimate') ? Number(form.get('repairEstimate')) : undefined,
      replacementEstimate: form.get('replacementEstimate') ? Number(form.get('replacementEstimate')) : undefined,
      policyLimit: Number(form.get('policyLimit')), excess: Number(form.get('excess')), depreciation: Number(form.get('depreciation')) / 100,
      exclusions: String(form.get('exclusions') ?? '').split(',').map((item) => item.trim()).filter(Boolean),
      idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) notify(result.errors[0].message); else { notify(`Assessment saved with a ${money.format(result.data.recommendedPayout)} recommendation.`); formElement.reset(); await refresh(); }
  }
  async function finalizeAssessment(id: string) {
    const result = await client.mutations.finalizeClaimPayoutAssessment({ assessmentId: id, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Assessment finalized for senior payout decision.'); await refresh(); }
  }
  const nextAction = claim.status === 'VALIDATING' ? ['START', 'Start assessment']
    : claim.status === 'APPROVED' ? ['PAYMENT_PENDING', 'Prepare payment']
      : claim.status === 'PAYMENT_PENDING' ? ['PAID', 'Mark as paid']
        : ['PAID', 'REJECTED'].includes(claim.status) && isSenior ? ['CLOSE', 'Close case'] : null;
  const modal = useModal(embedded ? undefined : onClose, `Case file ${claim.claimNumber ?? 'draft'}`);
  return <section className={`case-panel ${embedded ? 'embedded' : ''}`.trim()} {...(embedded ? {} : modal)} onClick={(event) => event.stopPropagation()}>
    <header className="case-header"><div><span className="eyebrow">EasyInsure case file</span><h2>{claim.claimNumber ?? 'Draft claim'}</h2><p>Police reference · {claim.policeCaseNumber ?? 'Legacy record'}</p></div><div><Status value={claim.status} />{onClose && <button className="icon-button" onClick={onClose} aria-label="Close case file">×</button>}</div></header>
    <div className="case-owner-strip"><span><small>Claim type</small><strong>{titleCase(claim.claimType)}</strong></span><span><small>Payout assessment</small><strong>{claim.suggestedPayout != null ? money.format(claim.suggestedPayout) : 'Pending evidence review'}</strong></span><span><small>Lead advisor</small><strong>{lead?.userDisplayNameSnapshot ?? 'Assignment in progress'}</strong></span><span><small>Submitted</small><strong>{shortDate(claim.submittedAt)}</strong></span></div>
    <div className="case-progress"><div className="progress-line"><i style={{ width: `${Math.min(100, currentIndex / (milestones.length - 1) * 100)}%` }} /></div>{milestones.map((item, index) => <span className={index <= currentIndex ? 'complete' : ''} key={item}><b>{index < currentIndex ? '✓' : index + 1}</b><small>{titleCase(item)}</small></span>)}</div>
    <nav className="case-tabs"><button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>Timeline <b>{feed.length}</b></button><button className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>Case team</button><button className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')}>Documents</button>{isStaff && <button className={tab === 'internal' ? 'active' : ''} onClick={() => setTab('internal')}>{canOperate ? 'Private notes' : 'Diagnostics'}</button>}{canOperate && nextAction && <button className="case-next-action" onClick={() => runAction(nextAction[0])}>{nextAction[1]} →</button>}</nav>
    <div className="case-content">
      {tab === 'timeline' && <>{isStaff && ['VALIDATING', 'UNDER_ASSESSMENT'].includes(claim.status) && <form className="info-request-form" onSubmit={requestInfo}><Field label="Information you need from the client" hint="The claim waits until the client replies. Be specific so they only need to respond once."><input name="request" placeholder="e.g. Please upload the panel beater's written quote" required /></Field><button className="secondary">Send request</button></form>}<div className="case-feed">{feed.length ? feed.map((item) => item.kind === 'activity' ? <ActivityItem item={item} key={`a-${item.id}`} /> : <CommunicationItem item={item} key={`c-${item.id}`} />) : <p className="empty">Case events will appear here.</p>}</div>{claim.status === 'INFO_NEEDED' && !isStaff ? <form className="case-composer info-response" onSubmit={provideInfo}><Field label="Your response to your advisor" hint="Sending this resumes your assessment."><textarea name="response" placeholder="Type the information your advisor asked for." required /></Field><button className="primary">Send and resume assessment</button></form> : claim.status !== 'CLOSED' && <form className="case-composer" onSubmit={onSend}><Field label="Send via" hint={isStaff ? 'Portal messages appear on the client timeline. Email, SMS and WhatsApp need a provider to be connected first.' : undefined}><select name="channel" disabled={!isStaff}><option value="PORTAL">Secure portal</option>{isStaff && <><option value="EMAIL">Email (not live yet)</option><option value="SMS">SMS (not live yet)</option><option value="WHATSAPP">WhatsApp (not live yet)</option></>}</select></Field><Field label={isStaff ? 'Message to the client' : 'Message to your advisor'} hint="Everything you send is kept on the permanent case record."><textarea name="body" placeholder={isStaff ? 'Write an update the client will see on their case timeline…' : 'Ask a question or share an update. Your advisor will see it on the case timeline…'} required /></Field><button className="primary">{isStaff ? 'Send update' : 'Send message'}</button></form>}</>}
      {tab === 'team' && <><div className="team-list">{team.map((item) => <article className={!item.active ? 'inactive' : ''} key={item.id}><span className="avatar">{item.userDisplayNameSnapshot.slice(0, 2).toUpperCase()}</span><div><strong>{item.userDisplayNameSnapshot}</strong><small>{titleCase(item.assignmentRole)} · {titleCase(item.userRoleSnapshot)}</small></div><Status value={item.active ? 'active' : 'ended'} /><time>{shortDate(item.assignedAt)}</time></article>)}</div>{isSenior && <form className="team-assignment-form" onSubmit={assign}><Field label="Officer to add"><select name="userSubject" required><option value="">Choose an officer…</option>{portfolio.profiles.filter((item) => item.businessRole !== 'client' && item.status === 'active').map((item) => <option value={item.owner} key={item.id}>{item.displayName || item.email} · {titleCase(item.businessRole)}</option>)}</select></Field><Field label="Role on this case" hint="A new lead advisor replaces the current one."><select name="assignmentRole"><option value="LEAD_ADVISOR">Lead advisor: the client's main contact</option><option value="SUPPORTING_ADVISOR">Supporting advisor: helps the lead</option><option value="ASSESSOR">Assessor: evaluates evidence and loss</option><option value="SPECIALIST">Specialist: expert input, e.g. forensic</option><option value="SUPERVISOR">Supervisor: oversees the case</option></select></Field><button className="primary">Add to case team</button></form>}</>}
      {tab === 'documents' && <div className="case-documents">{documents.map((item) => <article key={item.id}><span>{item.mediaType.includes('pdf') ? 'PDF' : 'IMG'}</span><div><strong>{item.fileName}</strong><small>{titleCase(item.category ?? 'incident evidence')} · {(item.byteSize / 1024 / 1024).toFixed(2)} MB</small></div><Status value={item.status} /></article>)}</div>}
      {tab === 'internal' && isStaff && <><div className="internal-warning">Private staff workspace · never visible to the client</div>{claim.status === 'UNDER_ASSESSMENT' && <details className="call-log-form" open><summary>Evidence-based payout assessment</summary><form onSubmit={assess}><Field label="Covered loss (ZAR)" hint="The loss value the evidence supports."><input name="coveredLossValue" type="number" min="0" placeholder="e.g. 98000" required /></Field><Field label="Repair estimate (ZAR, optional)" hint="From a quote. The lowest evidenced figure is used."><input name="repairEstimate" type="number" min="0" placeholder="e.g. 92000" /></Field><Field label="Replacement estimate (ZAR, optional)" hint="Cost of an equivalent replacement."><input name="replacementEstimate" type="number" min="0" placeholder="e.g. 120000" /></Field><Field label="Policy limit (ZAR)" hint="The most this policy pays for the asset."><input name="policyLimit" type="number" min="0" placeholder="e.g. 520000" required /></Field><Field label="Excess (ZAR)" hint="The client pays this first. It is deducted from the payout."><input name="excess" type="number" min="0" placeholder="e.g. 5000" required /></Field><Field label="Depreciation (%)" hint="0 to 100. Reduces the loss for age and wear."><input name="depreciation" type="number" min="0" max="100" placeholder="e.g. 10" required /></Field><Field label="Exclusions (optional)" hint="Separate with commas. Leave blank if none apply." className="wide"><input name="exclusions" placeholder="e.g. wear and tear, unlicensed driver" /></Field><small>{documents.filter((item) => item.status === 'CLEAN').length} clean evidence files will support this assessment.</small><button className="secondary">Calculate recommendation</button></form></details>}{assessments.map((item) => <article className="assessment-card" key={item.id}><div><strong>Assessment v{item.version} · {money.format(item.recommendedPayout)}</strong><small>{titleCase(item.status)} · limit {money.format(item.policyLimit)} · excess {money.format(item.excess)}</small></div>{isSenior && item.status === 'DRAFT' && <button className="primary" onClick={() => finalizeAssessment(item.id)}>Finalize assessment</button>}</article>)}<div className="case-feed">{notes.map((item) => <article className="feed-item internal" key={item.id}><i>IN</i><div><strong>{item.authorDisplayNameSnapshot}</strong><p>{item.body}</p><small>{new Date(item.occurredAt).toLocaleString('en-ZA')}</small></div></article>)}</div><form className="case-composer" onSubmit={onInternalNote}><Field label="Private note" hint="Visible to staff only. The client never sees it." className="wide"><textarea name="body" placeholder="e.g. Quote matches the photos. No sign of prior damage. Recommend standard depreciation." required /></Field><button className="secondary">Save private note</button></form><details className="call-log-form"><summary>Log a phone call</summary><form onSubmit={logCall}><Field label="Call direction"><select name="direction"><option value="OUTBOUND">Outgoing: we called the client</option><option value="INBOUND">Incoming: the client called us</option></select></Field><Field label="Who was on the call?"><input name="participants" placeholder="e.g. Thandi Mokoena (client)" required /></Field><Field label="Call start time"><input name="startedAt" type="datetime-local" required /></Field><Field label="Recording consent" hint="Only record or transcribe with the person's consent."><select name="consentStatus"><option value="NOT_RECORDED">No recording or transcript</option><option value="TRANSCRIPT_CONSENTED">Transcript consented</option><option value="RECORDING_CONSENTED">Recording consented</option></select></Field><Field label="Outcome and next step" className="wide"><input name="outcome" placeholder="e.g. Client will send the repair quote by Friday" required /></Field><Field label="Private advisor notes (optional)" hint="Visible to staff only." className="wide"><textarea name="advisorNotes" placeholder="Anything worth remembering from the call" /></Field><button className="secondary">Save call log</button></form></details></>}
    </div>
  </section>;
}

function ActivityItem({ item }: { item: ClaimActivity & { kind: 'activity' } }) {
  return <article className="feed-item"><i>✓</i><div><strong>{item.summary}</strong>{item.detail && <p>{item.detail}</p>}<small>{item.actorDisplayNameSnapshot} · {new Date(item.occurredAt).toLocaleString('en-ZA')}</small></div></article>;
}
function CommunicationItem({ item }: { item: ClaimCommunication & { kind: 'communication' } }) {
  return <article className={`feed-item message ${item.direction.toLowerCase()}`}><i>{item.channel.slice(0, 2)}</i><div><strong>{item.senderDisplayNameSnapshot}</strong><p>{item.body}</p><small>{titleCase(item.channel)} · {new Date(item.occurredAt).toLocaleString('en-ZA')} · {titleCase(item.deliveryState)}</small></div></article>;
}
