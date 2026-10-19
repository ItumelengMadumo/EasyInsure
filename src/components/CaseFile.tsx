import { FormEvent, useState } from 'react';
import { ClientStatusBadge, Field, Status } from './ui';
import { ConfirmModal } from './ConfirmModal';
import { DocumentPreview } from './DocumentPreview';
import { PayoutBreakdown } from './PayoutBreakdown';
import { nextSteps } from '../lib/caseSteps';
import { client } from '../lib/data';
import { dateTime, initials, money, shortDate, titleCase } from '../lib/format';
import { assetOf, clientName, leadAdvisor, policyOf } from '../lib/portfolio';
import type { Access } from '../lib/roles';
import { CLAIM_MILESTONES, trackerPosition } from '../lib/status';
import { uploadClaimFiles } from '../lib/uploads';
import { useModal } from '../lib/useModal';
import type { Claim, ClaimActivity, ClaimAssessment, ClaimCommunication, ClaimDocument, Portfolio } from '../types';

type Tab = 'timeline' | 'team' | 'documents' | 'internal';
type Props = {
  claim: Claim; portfolio: Portfolio; owner: string; access: Access; refresh: () => Promise<void>; notify: (message: string) => void;
  onClose?: () => void; embedded?: boolean;
};
type Dialog = { kind: 'payout' } | { kind: 'close' } | { kind: 'submit'; assessment: ClaimAssessment } | { kind: 'finalize'; assessment: ClaimAssessment };

const ASSESSMENT_STATUS: Record<string, string> = { DRAFT: 'Draft', SUBMITTED: 'Sent for senior review', FINALIZED: 'Finalised', FINAL: 'Finalised' };
const keys = () => ({ idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() });
const filesOf = (form: FormData, name: string) => form.getAll(name).filter((item): item is File => item instanceof File && item.size > 0);

/** The case file as a modal over the page. */
export function CaseDrawer(props: Props) {
  return <div className="case-backdrop" onClick={props.onClose}><CaseFile {...props} /></div>;
}

/** Drops an activity's detail when the same words already appear as a message beside it. */
function buildFeed(activities: ClaimActivity[], communications: ClaimCommunication[]) {
  const spoken = communications.map((item) => ({ body: item.body.trim(), at: Date.parse(item.occurredAt) }));
  const quiet = (activity: ClaimActivity) => (activity.detail && spoken.some((item) => item.body === activity.detail!.trim() && Math.abs(item.at - Date.parse(activity.occurredAt)) < 15 * 60_000) ? { ...activity, detail: null } : activity);
  return [
    ...activities.map((item) => ({ ...quiet(item), kind: 'activity' as const })),
    ...communications.map((item) => ({ ...item, kind: 'communication' as const })),
  ].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
}

export function CaseFile({ claim, portfolio, owner, access, refresh, notify, onClose, embedded = false }: Props) {
  const { isStaff, canOperate, isSenior, isClient, isDeveloper } = access;
  const [tab, setTab] = useState<Tab>('timeline');
  const [preview, setPreview] = useState<ClaimDocument | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const modal = useModal(embedded ? undefined : onClose, `Case file ${claim.claimNumber ?? 'draft'}`);

  const activities = portfolio.activities.filter((item) => item.claimId === claim.id);
  const communications = portfolio.communications.filter((item) => item.claimId === claim.id);
  const team = portfolio.assignments.filter((item) => item.claimId === claim.id);
  const documents = portfolio.documents.filter((item) => item.claimId === claim.id);
  const notes = portfolio.internalNotes.filter((item) => item.claimId === claim.id);
  const assessments = portfolio.claimAssessments.filter((item) => item.claimId === claim.id);
  const jobs = portfolio.jobs.filter((item) => item.claimId === claim.id);
  const feed = buildFeed(activities, communications);
  const position = trackerPosition(claim.status, activities.map((item) => item.milestone));
  const paused = claim.status === 'INFO_NEEDED';
  const lead = leadAdvisor(portfolio, claim.id);
  const asset = assetOf(portfolio, claim);
  const policy = policyOf(portfolio, claim);
  const steps = nextSteps(claim, access, { assessments, owner });
  const decided = ['APPROVED', 'PAYMENT_PENDING', 'PAID', 'CLOSED'].includes(claim.status);

  async function onSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget; const form = new FormData(formElement);
    const result = await client.mutations.sendClaimCommunication({
      claimId: claim.id, channel: String(form.get('channel') ?? 'PORTAL'), body: String(form.get('body')),
      subject: `Update for ${claim.claimNumber}`, visibility: 'CLIENT_VISIBLE',
      recipients: [claim.owner ?? owner], ...keys(),
    });
    if (result.errors?.length) return notify(result.errors[0].message);
    try { await uploadClaimFiles(claim.id, filesOf(form, 'attachments'), 'CORRESPONDENCE'); }
    catch (error) { notify(error instanceof Error ? error.message : 'An attachment could not be uploaded.'); await refresh(); return; }
    formElement.reset(); notify('Message added to the case timeline.'); await refresh();
  }
  async function onInternalNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget; const form = new FormData(formElement);
    const result = await client.mutations.addClaimInternalNote({ claimId: claim.id, body: String(form.get('body')), ...keys() });
    if (result.errors?.length) notify(result.errors[0].message);
    else { formElement.reset(); notify('Private case note saved.'); await refresh(); }
  }
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const profile = portfolio.profiles.find((item) => item.owner === form.get('userSubject'));
    if (!profile) return;
    const result = await client.mutations.assignClaimTeamMember({
      claimId: claim.id, userSubject: profile.owner, displayName: profile.displayName || profile.email,
      userRole: profile.businessRole, assignmentRole: String(form.get('assignmentRole')),
      isLead: form.get('assignmentRole') === 'LEAD_ADVISOR', ...keys(),
    });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Case team updated.'); await refresh(); }
  }
  async function provideInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const result = await client.mutations.provideClaimInformation({ claimId: claim.id, response: String(form.get('response')), ...keys() });
    if (result.errors?.length) return notify(result.errors[0].message);
    try { await uploadClaimFiles(claim.id, filesOf(form, 'attachments'), 'CORRESPONDENCE'); }
    catch (error) { notify(error instanceof Error ? error.message : 'An attachment could not be uploaded.'); await refresh(); return; }
    notify('Information sent to your advisor.'); formElement.reset(); await refresh();
  }
  async function requestInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const result = await client.mutations.requestClaimInformation({ claimId: claim.id, request: String(form.get('request')), ...keys() });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Information request added to the client timeline.'); formElement.reset(); await refresh(); }
  }
  async function logCall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const result = await client.mutations.logClaimCall({
      claimId: claim.id, direction: String(form.get('direction')), participants: [String(form.get('participants'))],
      startedAt: new Date(String(form.get('startedAt'))).toISOString(),
      consentStatus: String(form.get('consentStatus')), outcome: String(form.get('outcome')),
      advisorNotes: String(form.get('advisorNotes')), ...keys(),
    });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Call logged in the permanent case history.'); formElement.reset(); await refresh(); }
  }
  async function simpleAction(action: 'START' | 'PAYMENT_PENDING') {
    const result = action === 'START'
      ? await client.mutations.startClaimProcessing({ claimId: claim.id, ...keys() })
      : await client.mutations.transitionClaim({ claimId: claim.id, targetStatus: action, summary: 'Your approved payout is being prepared.', ...keys() });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Case progress updated.'); await refresh(); }
  }
  async function confirm(values: Record<string, string>) {
    const current = dialog; if (!current) return;
    let result;
    if (current.kind === 'payout') result = await client.mutations.recordClaimPayout({ claimId: claim.id, paidAmount: claim.approvedPayout ?? 0, paymentReference: values.paymentReference, correlationId: crypto.randomUUID() });
    else if (current.kind === 'close') result = await client.mutations.closeClaim({ claimId: claim.id, summary: values.summary || 'The case was closed after its final outcome.', ...keys() });
    else if (current.kind === 'submit') result = await client.mutations.submitClaimAssessment({ assessmentId: current.assessment.id, note: values.note || undefined, ...keys() });
    else result = await client.mutations.finalizeClaimPayoutAssessment({ assessmentId: current.assessment.id, ...keys() });
    if (result.errors?.length) { notify(result.errors[0].message); return; }
    setDialog(null);
    notify(current.kind === 'submit' ? 'Assessment sent for senior review.' : current.kind === 'finalize' ? 'Assessment finalised. The claim now awaits a decision.' : current.kind === 'payout' ? 'Payout recorded.' : 'Case closed.');
    await refresh();
  }

  const nextAction: [string, string] | null =
    claim.status === 'VALIDATING' && canOperate ? ['START', 'Start assessment']
    : claim.status === 'APPROVED' && canOperate ? ['PAYMENT_PENDING', 'Prepare payment']
    : claim.status === 'PAYMENT_PENDING' && isSenior ? ['PAID', 'Record payout']
    : ['PAID', 'REJECTED'].includes(claim.status) && isSenior ? ['CLOSE', 'Close case'] : null;
  const runNext = () => {
    if (!nextAction) return;
    if (nextAction[0] === 'PAID') setDialog({ kind: 'payout' });
    else if (nextAction[0] === 'CLOSE') setDialog({ kind: 'close' });
    else void simpleAction(nextAction[0] as 'START' | 'PAYMENT_PENDING');
  };
  const tabs: [Tab, string][] = [['timeline', `Timeline`], ['team', 'Case team'], ['documents', 'Documents'], ...(isStaff ? [['internal', canOperate ? 'Private notes' : 'Diagnostics'] as [Tab, string]] : [])];
  const payoutLabel = isClient ? (decided && claim.approvedPayout != null ? money.format(claim.approvedPayout) : 'Not decided yet')
    : claim.approvedPayout != null ? money.format(claim.approvedPayout) : claim.suggestedPayout != null ? money.format(claim.suggestedPayout) : 'Pending assessment';

  return <section className={`case-panel ${embedded ? 'embedded' : ''}`.trim()} {...(embedded ? {} : modal)} onClick={(event) => event.stopPropagation()}>
    <header className="case-header"><div><span className="eyebrow">EasyInsure case file</span><h2>{claim.claimNumber ?? 'Draft claim'}</h2><p>Police reference · {claim.policeCaseNumber ?? 'Legacy record'}</p></div><div>{isClient ? <ClientStatusBadge status={claim.status} /> : <Status value={claim.status} />}{onClose && <button className="icon-button" onClick={onClose} aria-label="Close case file">×</button>}</div></header>
    <section className="case-details" aria-label="The claim">
      <h3>The claim</h3>
      <p>{claim.description}</p>
      <dl>
        <div><dt>Asset</dt><dd>{asset?.description ?? 'Insured asset'}</dd></div>
        <div><dt>Incident</dt><dd>{dateTime(claim.incidentDate)}</dd></div>
        <div><dt>Location</dt><dd>{claim.incidentLocation || 'Not recorded'}</dd></div>
        <div><dt>Policy</dt><dd>{policy?.policyNumber ?? '—'}</dd></div>
        {isStaff && <div><dt>Client</dt><dd>{clientName(portfolio, claim.owner)}</dd></div>}
      </dl>
    </section>
    <div className="case-owner-strip"><span><small>Claim type</small><strong>{titleCase(claim.claimType)}</strong></span><span><small>{isClient || claim.approvedPayout != null ? 'Approved payout' : 'Assessed payout'}</small><strong>{payoutLabel}</strong></span><span><small>Lead advisor</small><strong>{lead?.userDisplayNameSnapshot ?? 'Assignment in progress'}</strong></span><span><small>Submitted</small><strong>{shortDate(claim.submittedAt)}</strong></span></div>
    <div className="case-progress"><div className="progress-line"><i style={{ width: `${Math.min(100, position / (CLAIM_MILESTONES.length - 1) * 100)}%` }} /></div>{CLAIM_MILESTONES.map((item, index) => <span className={`${index <= position ? 'complete' : ''} ${paused && index === position ? 'paused' : ''}`.trim()} key={item}><b>{paused && index === position ? '⏸' : index < position ? '✓' : index + 1}</b><small>{titleCase(item)}</small>{paused && index === position && <em>{isClient ? 'Waiting on you' : 'Waiting on client'}</em>}</span>)}</div>
    <aside className={`next-steps ${paused && isClient ? 'action' : ''}`.trim()}><strong>{isClient ? 'What happens next' : 'What you can do now'}</strong><b>{steps.heading}</b><ul>{steps.items.map((item) => <li key={item}>{item}</li>)}</ul></aside>
    <nav className="case-tabs" role="tablist" aria-label="Case sections">{tabs.map(([id, label]) => <button role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}>{label}{id === 'timeline' && <b>{feed.length}</b>}</button>)}{nextAction && <button className="case-next-action" onClick={runNext}>{nextAction[1]} →</button>}</nav>
    <div className="case-content">
      {tab === 'timeline' && <>
        {canOperate && ['VALIDATING', 'UNDER_ASSESSMENT'].includes(claim.status) && <form className="info-request-form" onSubmit={requestInfo}><Field label="Information you need from the client" hint="The claim waits until the client replies. Be specific so they only need to respond once."><input name="request" placeholder="e.g. Please upload the panel beater's written quote" required /></Field><button className="secondary">Send request</button></form>}
        <div className="case-feed">{feed.length ? feed.map((item) => item.kind === 'activity' ? <ActivityItem item={item} key={`a-${item.id}`} /> : <CommunicationItem item={item} key={`c-${item.id}`} />) : <p className="empty">Case events will appear here.</p>}</div>
        {claim.status === 'INFO_NEEDED' && isClient
          ? <form className="case-composer info-response" onSubmit={provideInfo}><Field label="Your response to your advisor" hint="Sending this resumes your assessment."><textarea name="response" placeholder="Type the information your advisor asked for. You can attach photos, videos or documents below." required /></Field><Field label="Attach files (optional)" hint="Photos, videos or documents. PDF, JPEG, PNG, HEIC, MP4 or MOV; choose as many as you need."><input name="attachments" type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.mp4,.mov" multiple /></Field><button className="primary">Send and resume assessment</button></form>
          : claim.status !== 'CLOSED' && !isDeveloper && <form className="case-composer" onSubmit={onSend}><Field label="Send via" hint={isStaff ? 'Portal messages appear on the client timeline. Email, SMS and WhatsApp need a provider to be connected first.' : undefined}><select name="channel" disabled={!isStaff}><option value="PORTAL">Secure portal</option>{isStaff && <><option value="EMAIL">Email (not live yet)</option><option value="SMS">SMS (not live yet)</option><option value="WHATSAPP">WhatsApp (not live yet)</option></>}</select></Field><Field label={isStaff ? 'Message to the client' : 'Message to your advisor'} hint="Everything you send is kept on the permanent case record."><textarea name="body" placeholder={isStaff ? 'Write an update the client will see on their case timeline…' : 'Ask a question or share an update. Your advisor will see it on the case timeline…'} required /></Field>{isClient && <Field label="Attach files (optional)" className="wide"><input name="attachments" type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.mp4,.mov" multiple /></Field>}<button className="primary">{isStaff ? 'Send update' : 'Send message'}</button></form>}
      </>}
      {tab === 'team' && <><div className="team-list">{team.map((item) => <article className={!item.active ? 'inactive' : ''} key={item.id}><span className="avatar">{initials(item.userDisplayNameSnapshot)}</span><div><strong>{item.userDisplayNameSnapshot}</strong><small>{titleCase(item.assignmentRole)} · {titleCase(item.userRoleSnapshot)}</small></div><Status value={item.active ? 'active' : 'ended'} /><time>{shortDate(item.assignedAt)}</time></article>)}{!team.length && <p className="empty">No one is assigned to this case yet.</p>}</div>{isSenior && <form className="team-assignment-form" onSubmit={assign}><Field label="Officer to add"><select name="userSubject" required><option value="">Choose an officer…</option>{portfolio.profiles.filter((item) => item.businessRole !== 'client' && item.status === 'active').map((item) => <option value={item.owner} key={item.id}>{item.displayName || item.email} · {titleCase(item.businessRole)}</option>)}</select></Field><Field label="Role on this case" hint="A new lead advisor replaces the current one."><select name="assignmentRole"><option value="LEAD_ADVISOR">Lead advisor: the client's main contact</option><option value="SUPPORTING_ADVISOR">Supporting advisor: helps the lead</option><option value="ASSESSOR">Assessor: evaluates evidence and loss</option><option value="SPECIALIST">Specialist: expert input, e.g. forensic</option><option value="SUPERVISOR">Supervisor: oversees the case</option></select></Field><button className="primary">Add to case team</button></form>}</>}
      {tab === 'documents' && <div className="case-documents">{documents.map((item) => <button className="doc-row" key={item.id} onClick={() => setPreview(item)} aria-label={`Preview ${item.fileName}`}><span>{item.mediaType.includes('pdf') ? 'PDF' : item.mediaType.startsWith('video/') ? 'VID' : 'IMG'}</span><div><strong>{item.fileName}</strong><small>{titleCase(item.category ?? 'incident evidence')} · {(item.byteSize / 1024 / 1024).toFixed(2)} MB</small></div><Status value={item.status} /><i>Preview →</i></button>)}{!documents.length && <p className="empty">No documents have been added yet.</p>}</div>}
      {tab === 'internal' && isStaff && <>
        <div className="internal-warning">{canOperate ? 'Private staff workspace · never visible to the client' : 'Read-only diagnostics · client identity and narrative are removed'}</div>
        {isDeveloper && <div className="case-feed">{jobs.length ? jobs.map((job) => <article className="feed-item" key={job.id}><i>{job.status === 'FAILED' ? '!' : '✓'}</i><div><strong>Processing job · {titleCase(job.status)}</strong><p>{titleCase(job.currentStep ?? 'queued')} · {job.attempts ?? 0} attempt(s){job.errorMessage ? ` · ${job.errorMessage}` : ''}</p><small>{dateTime(job.completedAt ?? job.startedAt ?? job.createdAt)}</small></div></article>) : <p className="empty">No processing jobs for this case.</p>}</div>}
        {canOperate && <AssessmentPanel claim={claim} portfolio={portfolio} owner={owner} access={access} assessments={assessments} documents={documents} onDialog={setDialog} refresh={refresh} notify={notify} />}
        {canOperate && <><div className="case-feed">{notes.map((item) => <article className="feed-item internal" key={item.id}><i>{initials(item.authorDisplayNameSnapshot)}</i><div><strong>{item.authorDisplayNameSnapshot}</strong><p>{item.body}</p><small>{dateTime(item.occurredAt)}</small></div></article>)}</div>
          <form className="case-composer" onSubmit={onInternalNote}><Field label="Private note" hint="Visible to staff only. The client never sees it." className="wide"><textarea name="body" placeholder="e.g. Quote matches the photos. No sign of prior damage. Recommend standard depreciation." required /></Field><button className="secondary">Save private note</button></form>
          <details className="call-log-form"><summary>Log a phone call</summary><form onSubmit={logCall}><Field label="Call direction"><select name="direction"><option value="OUTBOUND">Outgoing: we called the client</option><option value="INBOUND">Incoming: the client called us</option></select></Field><Field label="Who was on the call?"><input name="participants" placeholder="e.g. Thandi Mokoena (client)" required /></Field><Field label="Call start time"><input name="startedAt" type="datetime-local" required /></Field><Field label="Recording consent" hint="Only record or transcribe with the person's consent."><select name="consentStatus"><option value="NOT_RECORDED">No recording or transcript</option><option value="TRANSCRIPT_CONSENTED">Transcript consented</option><option value="RECORDING_CONSENTED">Recording consented</option></select></Field><Field label="Outcome and next step" className="wide"><input name="outcome" placeholder="e.g. Client will send the repair quote by Friday" required /></Field><Field label="Private advisor notes (optional)" hint="Visible to staff only." className="wide"><textarea name="advisorNotes" placeholder="Anything worth remembering from the call" /></Field><button className="secondary">Save call log</button></form></details></>}
      </>}
    </div>
    {preview && <DocumentPreview key={preview.id} document={preview} claimNumber={claim.claimNumber} onClose={() => setPreview(null)} />}
    {dialog?.kind === 'payout' && <ConfirmModal title="Record the payout" description={`Confirm that ${money.format(claim.approvedPayout ?? 0)} has been paid to the client. This cannot be undone.`} confirmLabel="Record payout" fields={[{ name: 'paymentReference', label: 'Bank or EFT reference', hint: 'The reference on the payment confirmation (at least 4 characters).', placeholder: 'e.g. EFT-2026-004871', required: true, minLength: 4 }]} onCancel={() => setDialog(null)} onConfirm={confirm} />}
    {dialog?.kind === 'close' && <ConfirmModal title="Close this case" description="Closing finishes the case. It stays on record but no further changes can be made." confirmLabel="Close case" fields={[{ name: 'summary', label: 'Closing note (optional)', placeholder: 'e.g. Paid in full, no further action needed', type: 'textarea' }]} onCancel={() => setDialog(null)} onConfirm={confirm} />}
    {dialog?.kind === 'submit' && <ConfirmModal title="Send for senior review" description="A senior officer will review this assessment and finalise it so the claim can go to a decision. You will not be able to edit it afterwards." summary={<PayoutBreakdown input={dialog.assessment} />} confirmLabel="Send for review" fields={[{ name: 'note', label: 'Note for the senior officer (optional)', placeholder: 'e.g. Repair quote matches the photos. Standard depreciation applied.', type: 'textarea' }]} onCancel={() => setDialog(null)} onConfirm={confirm} />}
    {dialog?.kind === 'finalize' && <ConfirmModal title="Finalise this assessment" description="Finalising sends the claim to a decision. The officer who finalises an assessment cannot also decide the claim." summary={<PayoutBreakdown input={dialog.assessment} />} confirmLabel="Finalise assessment" onCancel={() => setDialog(null)} onConfirm={confirm} />}
  </section>;
}

function AssessmentPanel({ claim, portfolio, owner, access, assessments, documents, onDialog, refresh, notify }: {
  claim: Claim; portfolio: Portfolio; owner: string; access: Access; assessments: ClaimAssessment[]; documents: ClaimDocument[];
  onDialog: (dialog: Dialog) => void; refresh: () => Promise<void>; notify: (message: string) => void;
}) {
  const policy = policyOf(portfolio, claim);
  const clean = documents.filter((item) => item.status === 'CLEAN');
  const [values, setValues] = useState({ coveredLossValue: '', repairEstimate: '', replacementEstimate: '', policyLimit: String(policy?.coverLimit ?? ''), excess: String(policy?.excess ?? ''), depreciation: '', exclusions: '' });
  const [picked, setPicked] = useState<Set<string>>(() => new Set(clean.map((item) => item.id)));
  const set = (key: keyof typeof values) => (event: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const optional = (text: string) => (text.trim() === '' ? undefined : Number(text));
  const covered = optional(values.coveredLossValue); const limit = optional(values.policyLimit); const excess = optional(values.excess); const pct = optional(values.depreciation);
  const ready = [covered, limit, excess, pct].every((item) => item !== undefined && Number.isFinite(item) && item >= 0) && (pct ?? 0) <= 100;
  const live = ready ? { coveredLossValue: covered!, repairEstimate: optional(values.repairEstimate), replacementEstimate: optional(values.replacementEstimate), policyLimit: limit!, excess: excess!, depreciation: pct! / 100 } : null;
  const mine = (item: ClaimAssessment) => item.assessorSubject === owner || access.isSenior;
  const canPrepare = claim.status === 'UNDER_ASSESSMENT' && !assessments.some((item) => item.status === 'DRAFT' && mine(item));

  async function assess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!live) return;
    const result = await client.mutations.calculateClaimPayoutAssessment({
      claimId: claim.id, evidenceReviewed: [...picked], ...live,
      exclusions: values.exclusions.split(',').map((item) => item.trim()).filter(Boolean), ...keys(),
    });
    if (result.errors?.length) return notify(result.errors[0].message);
    notify(`Assessment saved with a ${money.format(result.data.recommendedPayout)} recommendation. Send it for senior review when you are ready.`);
    setValues((current) => ({ ...current, coveredLossValue: '', repairEstimate: '', replacementEstimate: '', depreciation: '', exclusions: '' }));
    await refresh();
  }

  return <section className="assessment-section">
    {canPrepare && <details className="call-log-form" open={!assessments.length}><summary>Evidence-based payout assessment</summary><form onSubmit={assess}>
      <Field label="Covered loss (ZAR)" hint="The loss value the evidence supports."><input value={values.coveredLossValue} onChange={set('coveredLossValue')} type="number" min="0" placeholder="e.g. 98000" required /></Field>
      <Field label="Repair estimate (ZAR, optional)" hint="From a quote. The lowest evidenced figure is used."><input value={values.repairEstimate} onChange={set('repairEstimate')} type="number" min="0" placeholder="e.g. 92000" /></Field>
      <Field label="Replacement estimate (ZAR, optional)" hint="Cost of an equivalent replacement."><input value={values.replacementEstimate} onChange={set('replacementEstimate')} type="number" min="0" placeholder="e.g. 120000" /></Field>
      <Field label="Policy limit (ZAR)" hint={policy?.coverLimit ? 'Pre-filled from the policy schedule.' : 'The most this policy pays for the asset.'}><input value={values.policyLimit} onChange={set('policyLimit')} type="number" min="0" placeholder="e.g. 520000" required /></Field>
      <Field label="Excess (ZAR)" hint={policy?.excess != null ? 'Pre-filled from the policy schedule. Deducted from the payout.' : 'The client pays this first. It is deducted from the payout.'}><input value={values.excess} onChange={set('excess')} type="number" min="0" placeholder="e.g. 5000" required /></Field>
      <Field label="Depreciation (%)" hint="0 to 100. Reduces the loss for age and wear."><input value={values.depreciation} onChange={set('depreciation')} type="number" min="0" max="100" placeholder="e.g. 10" required /></Field>
      <Field label="Exclusions (optional)" hint={policy?.exclusions?.length ? `Policy exclusions: ${policy.exclusions.join(', ')}. Separate yours with commas.` : 'Separate with commas. Leave blank if none apply.'} className="wide"><input value={values.exclusions} onChange={set('exclusions')} placeholder="e.g. wear and tear, unlicensed driver" /></Field>
      <fieldset className="wide evidence-picks"><legend>Evidence reviewed</legend>{clean.length ? clean.map((item) => <label key={item.id}><input type="checkbox" checked={picked.has(item.id)} onChange={(event) => setPicked((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} /> {item.fileName}<small>{titleCase(item.category ?? 'evidence')}</small></label>) : <p className="empty">No clean evidence yet. An assessment needs at least one scanned file.</p>}</fieldset>
      {live && <div className="wide"><PayoutBreakdown input={live} title="Preview: how the recommendation will be calculated" /></div>}
      <button className="secondary" disabled={!live || !picked.size}>Calculate recommendation</button>
    </form></details>}
    {assessments.sort((a, b) => b.version - a.version).map((item) => <article className="assessment-card" key={item.id}>
      <div><strong>Assessment v{item.version} · {money.format(item.recommendedPayout)}</strong><small>{ASSESSMENT_STATUS[item.status] ?? titleCase(item.status)} · prepared by {item.assessorDisplayNameSnapshot ?? 'an officer'}{item.finalizedAt ? ` · finalised ${shortDate(item.finalizedAt)}` : ''}</small>
        <details><summary>See the calculation</summary><PayoutBreakdown input={item} /></details></div>
      <div className="assessment-actions">
        {item.status === 'DRAFT' && mine(item) && claim.status === 'UNDER_ASSESSMENT' && <button className="primary" onClick={() => onDialog({ kind: 'submit', assessment: item })}>Send for senior review</button>}
        {['DRAFT', 'SUBMITTED'].includes(item.status) && access.isSenior && claim.status === 'UNDER_ASSESSMENT' && <button className={item.status === 'SUBMITTED' ? 'primary' : 'secondary'} onClick={() => onDialog({ kind: 'finalize', assessment: item })}>Finalise assessment</button>}
      </div>
    </article>)}
  </section>;
}

function ActivityItem({ item }: { item: ClaimActivity & { kind: 'activity' } }) {
  return <article className="feed-item"><i>✓</i><div><strong>{item.summary}{item.visibility === 'INTERNAL' && <span className="tag-staff">Staff only</span>}</strong>{item.detail && <p>{item.detail}</p>}<small>{item.actorDisplayNameSnapshot} · {dateTime(item.occurredAt)}</small></div></article>;
}
function CommunicationItem({ item }: { item: ClaimCommunication & { kind: 'communication' } }) {
  return <article className={`feed-item message ${item.direction.toLowerCase()}`}><i>{item.channel.slice(0, 2)}</i><div><strong>{item.senderDisplayNameSnapshot}</strong><p>{item.body}</p><small>{titleCase(item.channel)} · {dateTime(item.occurredAt)} · {titleCase(item.deliveryState)}</small></div></article>;
}
