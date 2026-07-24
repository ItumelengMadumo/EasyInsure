import { FormEvent, useMemo, useState } from 'react';
import { uploadData } from 'aws-amplify/storage';
import { ClaimTable, Field, PageHeader, Status } from '../components/ui';
import { client } from '../lib/data';
import { money, shortDate, titleCase } from '../lib/format';
import type { Claim, ClaimActivity, ClaimCommunication, Portfolio } from '../types';

type Props = {
  portfolio: Portfolio; owner: string; groups: string[];
  refresh: () => Promise<void>; notify: (message: string) => void;
};
const milestones = ['SUBMITTED', 'VALIDATING', 'UNDER_ASSESSMENT', 'DECISION_PENDING', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'CLOSED'];

async function uploadClaimFile(owner: string, claimId: string, file: File, category: string) {
  if (file.size > 10 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
    throw new Error('Documents must be PDF, JPEG or PNG and under 10 MB.');
  }
  const objectKey = `quarantine/${owner}/${claimId}/${crypto.randomUUID()}-${file.name}`;
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  await uploadData({ path: objectKey, data: file, options: { contentType: file.type } }).result;
  const document = await client.models.ClaimDocument.create({
    owner, claimId, objectKey, fileName: file.name, mediaType: file.type, byteSize: file.size,
    checksum, status: 'QUARANTINED', uploadedBy: owner, category, visibility: 'CLIENT_VISIBLE',
  });
  if (document.errors?.length) throw new Error(document.errors[0].message);
}

export function ClaimsPage({ portfolio, owner, groups, refresh, notify }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [selected, setSelected] = useState<Claim | null>(null);
  const [sending, setSending] = useState(false);
  const isSenior = groups.some((group) => ['senior_officer', 'superuser'].includes(group));
  const isDeveloper = groups.includes('developer');
  const isStaff = groups.some((group) => group.includes('officer') || ['developer', 'superuser'].includes(group));
  const canOperate = isStaff && !isDeveloper;
  const assignedIds = new Set(portfolio.assignments.filter((item) => item.active && item.userSubject === owner).map((item) => item.claimId));
  const roleClaims = isSenior || isDeveloper ? portfolio.claims : isStaff ? portfolio.claims.filter((claim) => assignedIds.has(claim.id)) : portfolio.claims;
  const claims = filter === 'ALL' ? roleClaims : roleClaims.filter((claim) => claim.status === filter);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSending(true);
    const formElement = event.currentTarget; const form = new FormData(formElement);
    const asset = portfolio.assets.find((item) => item.id === form.get('assetId'));
    try {
      if (!asset?.policyId) throw new Error('Select an asset linked to an active policy.');
      const affidavit = form.get('affidavit');
      if (!(affidavit instanceof File) || !affidavit.size) throw new Error('A police affidavit is required for every claim.');
      const draft = await client.mutations.createClaimDraft({
        policyId: asset.policyId, assetId: asset.id, policeCaseNumber: String(form.get('policeCaseNumber')),
        claimType: String(form.get('claimType')), description: String(form.get('description')),
        incidentDate: new Date(String(form.get('incidentDate'))).toISOString(),
        incidentLocation: String(form.get('incidentLocation')),
        idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
      });
      if (draft.errors?.length || !draft.data) throw new Error(draft.errors?.[0]?.message ?? 'Claim draft failed.');
      await uploadClaimFile(owner, draft.data.id, affidavit, 'AFFIDAVIT');
      const evidence = form.get('evidence');
      if (evidence instanceof File && evidence.size) await uploadClaimFile(owner, draft.data.id, evidence, 'INCIDENT_EVIDENCE');
      const result = await client.mutations.submitClaimDraft({
        claimId: draft.data.id, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
      });
      if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Claim submission failed.');
      formElement.reset(); setOpen(false); notify(`Claim ${result.data.claimNumber} was submitted and is being assigned.`);
      await refresh(); setSelected(result.data);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Claim submission failed.');
    } finally { setSending(false); }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    const form = new FormData(event.currentTarget);
    const result = await client.mutations.sendClaimCommunication({
      claimId: selected.id, channel: String(form.get('channel')), body: String(form.get('body')),
      subject: `Update for ${selected.claimNumber}`, visibility: 'CLIENT_VISIBLE',
      recipients: [selected.owner ?? owner], idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) notify(result.errors[0].message);
    else { event.currentTarget.reset(); notify('Message added to the case timeline.'); await refresh(); }
  }

  async function addInternalNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    const form = new FormData(event.currentTarget);
    const result = await client.mutations.addClaimInternalNote({
      claimId: selected.id, body: String(form.get('body')),
      idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) notify(result.errors[0].message);
    else { event.currentTarget.reset(); notify('Private case note saved.'); await refresh(); }
  }

  const heading = isDeveloper ? 'Claim diagnostics and traceability.' : isSenior ? 'Every claim, under control.' : isStaff ? 'Cases you are assisting.' : 'From incident to outcome.';
  const description = isSenior
    ? 'Oversee assignment, progress, communication and decisions across the entire claims operation.'
    : isDeveloper ? 'Inspect case state, processing history and integration outcomes without financial approval authority.'
    : isStaff ? 'Work your assigned portfolio with a complete, chronological client record.'
      : 'Submit once, follow every event and keep all communication attached to the case.';
  return <>
    <PageHeader eyebrow={isDeveloper ? 'Developer diagnostics' : isSenior ? 'Claims oversight' : isStaff ? 'Advisor portfolio' : 'Claims centre'} title={heading} description={description}
      action={!isStaff && <button className="primary" onClick={() => setOpen(!open)}>＋ Start a claim</button>} />
    {open && <form className="panel claim-form" onSubmit={submit}>
      <div className="form-heading"><div><span className="eyebrow">Mandatory incident record</span><h2>Submit a new insurance claim</h2><p>Your police case number and affidavit are required before the claim can be lodged.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)}>×</button></div>
      <div className="claim-form-section"><span>01</span><div><h3>Police report</h3><div className="form-grid compact"><Field label="Police case number" hint="Enter the reference exactly as provided by SAPS."><input name="policeCaseNumber" placeholder="e.g. CAS 123/07/2026" required /></Field><Field label="Police affidavit" hint="PDF, JPEG or PNG · maximum 10 MB"><input name="affidavit" type="file" accept=".pdf,.jpg,.jpeg,.png" required /></Field></div></div></div>
      <div className="claim-form-section"><span>02</span><div><h3>Incident and cover</h3><p>Your insurer determines a suggested payout after reviewing clean evidence, policy limits, excess and depreciation.</p><div className="form-grid compact"><Field label="Covered asset"><select name="assetId" required><option value="">Select an insured asset</option>{portfolio.assets.filter((asset) => asset.policyId).map((asset) => <option key={asset.id} value={asset.id}>{asset.description || asset.assetType}</option>)}</select></Field><Field label="Incident type"><select name="claimType" required><option value="accidental_damage">Accidental damage</option><option value="theft">Theft</option><option value="weather">Weather damage</option><option value="fire">Fire</option><option value="other">Other</option></select></Field><Field label="Incident date"><input name="incidentDate" type="datetime-local" required /></Field><Field label="Location"><input name="incidentLocation" required /></Field><Field label="Additional evidence"><input name="evidence" type="file" accept=".pdf,.jpg,.jpeg,.png" /></Field><Field label="Incident description"><textarea name="description" rows={4} minLength={10} required /></Field></div></div></div>
      <div className="form-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={sending}>{sending ? 'Securing documents…' : 'Submit claim securely'}</button></div>
    </form>}
    <CaseStats claims={roleClaims} assignments={portfolio.assignments} isSenior={isSenior} />
    <div className="filter-tabs">{['ALL', 'ASSIGNMENT_PENDING', 'VALIDATING', 'UNDER_ASSESSMENT', 'INFO_NEEDED', 'DECISION_PENDING', 'APPROVED', 'PAID', 'CLOSED'].map((status) => <button className={filter === status ? 'active' : ''} onClick={() => setFilter(status)} key={status}>{status === 'ALL' ? 'All cases' : titleCase(status)}</button>)}</div>
    <section className="panel table-panel"><ClaimTable claims={claims} onSelect={setSelected} /></section>
    {selected && <CaseDrawer claim={portfolio.claims.find((item) => item.id === selected.id) ?? selected} portfolio={portfolio} isStaff={isStaff} canOperate={canOperate} isSenior={isSenior} onClose={() => setSelected(null)} onSend={sendMessage} onInternalNote={addInternalNote} refresh={refresh} notify={notify} />}
  </>;
}

function CaseStats({ claims, assignments, isSenior }: { claims: Claim[]; assignments: Portfolio['assignments']; isSenior: boolean }) {
  return <div className="case-stats"><div><small>{isSenior ? 'Total portfolio' : 'My portfolio'}</small><strong>{claims.length}</strong></div><div><small>Needs client response</small><strong>{claims.filter((item) => item.status === 'INFO_NEEDED').length}</strong></div><div><small>Decision pending</small><strong>{claims.filter((item) => item.status === 'DECISION_PENDING').length}</strong></div><div><small>Unassigned</small><strong>{claims.filter((claim) => !assignments.some((item) => item.claimId === claim.id && item.active && item.isLead)).length}</strong></div></div>;
}

function CaseDrawer({ claim, portfolio, isStaff, canOperate, isSenior, onClose, onSend, onInternalNote, refresh, notify }: {
  claim: Claim; portfolio: Portfolio; isStaff: boolean; canOperate: boolean; isSenior: boolean; onClose: () => void;
  onSend: (event: FormEvent<HTMLFormElement>) => void; onInternalNote: (event: FormEvent<HTMLFormElement>) => void;
  refresh: () => Promise<void>; notify: (message: string) => void;
}) {
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
    event.preventDefault(); const form = new FormData(event.currentTarget);
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
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const result = await client.mutations.provideClaimInformation({
      claimId: claim.id, response: String(form.get('response')),
      idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Information sent to your advisor.'); event.currentTarget.reset(); await refresh(); }
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
    else result = await client.mutations.transitionClaim({
      claimId: claim.id, targetStatus: action,
      summary: action === 'PAYMENT_PENDING' ? 'Your approved payout is being prepared.' : action === 'PAID' ? 'Your claim payment was completed.' : `Claim moved to ${titleCase(action)}.`,
      idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Case progress updated.'); await refresh(); }
  }
  async function requestInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const result = await client.mutations.requestClaimInformation({
      claimId: claim.id, request: String(form.get('request')),
      idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Information request added to the client timeline.'); event.currentTarget.reset(); await refresh(); }
  }
  async function logCall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const result = await client.mutations.logClaimCall({
      claimId: claim.id, direction: String(form.get('direction')), participants: [String(form.get('participants'))],
      startedAt: new Date(String(form.get('startedAt'))).toISOString(),
      consentStatus: String(form.get('consentStatus')), outcome: String(form.get('outcome')),
      advisorNotes: String(form.get('advisorNotes')), idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Call logged in the permanent case history.'); event.currentTarget.reset(); await refresh(); }
  }
  async function assess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const result = await client.mutations.createClaimAssessment({
      claimId: claim.id, evidenceReviewed: documents.filter((item) => item.status === 'CLEAN').map((item) => item.id),
      coveredLossValue: Number(form.get('coveredLossValue')), repairEstimate: form.get('repairEstimate') ? Number(form.get('repairEstimate')) : undefined,
      replacementEstimate: form.get('replacementEstimate') ? Number(form.get('replacementEstimate')) : undefined,
      policyLimit: Number(form.get('policyLimit')), excess: Number(form.get('excess')), depreciation: Number(form.get('depreciation')) / 100,
      exclusions: String(form.get('exclusions') ?? '').split(',').map((item) => item.trim()).filter(Boolean),
      idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) notify(result.errors[0].message); else { notify(`Assessment saved with a ${money.format(result.data.recommendedPayout)} recommendation.`); event.currentTarget.reset(); await refresh(); }
  }
  async function finalizeAssessment(id: string) {
    const result = await client.mutations.finalizeClaimAssessment({ assessmentId: id, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Assessment finalized for senior payout decision.'); await refresh(); }
  }
  const nextAction = claim.status === 'VALIDATING' ? ['START', 'Start assessment']
    : claim.status === 'APPROVED' ? ['PAYMENT_PENDING', 'Prepare payment']
      : claim.status === 'PAYMENT_PENDING' ? ['PAID', 'Mark as paid']
        : ['PAID', 'REJECTED'].includes(claim.status) && isSenior ? ['CLOSE', 'Close case'] : null;
  return <div className="case-backdrop" onClick={onClose}><section className="case-panel" onClick={(event) => event.stopPropagation()}>
    <header className="case-header"><div><span className="eyebrow">EasyInsure case file</span><h2>{claim.claimNumber ?? 'Draft claim'}</h2><p>Police reference · {claim.policeCaseNumber ?? 'Legacy record'}</p></div><div><Status value={claim.status} /><button className="icon-button" onClick={onClose}>×</button></div></header>
    <div className="case-owner-strip"><span><small>Claim type</small><strong>{titleCase(claim.claimType)}</strong></span><span><small>Payout assessment</small><strong>{claim.suggestedPayout != null ? money.format(claim.suggestedPayout) : 'Pending evidence review'}</strong></span><span><small>Lead advisor</small><strong>{lead?.userDisplayNameSnapshot ?? 'Assignment in progress'}</strong></span><span><small>Submitted</small><strong>{shortDate(claim.submittedAt)}</strong></span></div>
    <div className="case-progress"><div className="progress-line"><i style={{ width: `${Math.min(100, currentIndex / (milestones.length - 1) * 100)}%` }} /></div>{milestones.map((item, index) => <span className={index <= currentIndex ? 'complete' : ''} key={item}><b>{index < currentIndex ? '✓' : index + 1}</b><small>{titleCase(item)}</small></span>)}</div>
    <nav className="case-tabs"><button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>Timeline <b>{feed.length}</b></button><button className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>Case team</button><button className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')}>Documents</button>{isStaff && <button className={tab === 'internal' ? 'active' : ''} onClick={() => setTab('internal')}>{canOperate ? 'Private notes' : 'Diagnostics'}</button>}{canOperate && nextAction && <button className="case-next-action" onClick={() => runAction(nextAction[0])}>{nextAction[1]} →</button>}</nav>
    <div className="case-content">
      {tab === 'timeline' && <>{isStaff && ['VALIDATING', 'UNDER_ASSESSMENT'].includes(claim.status) && <form className="info-request-form" onSubmit={requestInfo}><input name="request" placeholder="Request specific information from the client…" required /><button className="secondary">Request information</button></form>}<div className="case-feed">{feed.length ? feed.map((item) => item.kind === 'activity' ? <ActivityItem item={item} key={`a-${item.id}`} /> : <CommunicationItem item={item} key={`c-${item.id}`} />) : <p className="empty">Case events will appear here.</p>}</div>{claim.status === 'INFO_NEEDED' && !isStaff ? <form className="case-composer info-response" onSubmit={provideInfo}><textarea name="response" placeholder="Provide the information requested by your advisor…" required /><button className="primary">Send and resume assessment</button></form> : claim.status !== 'CLOSED' && <form className="case-composer" onSubmit={onSend}><select name="channel" disabled={!isStaff}><option value="PORTAL">Secure portal</option>{isStaff && <><option value="EMAIL">Email adapter</option><option value="SMS">SMS adapter</option><option value="WHATSAPP">WhatsApp adapter</option></>}</select><textarea name="body" placeholder={isStaff ? 'Send the client an update…' : 'Reply to your advisor…'} required /><button className="primary">Send update</button></form>}</>}
      {tab === 'team' && <><div className="team-list">{team.map((item) => <article className={!item.active ? 'inactive' : ''} key={item.id}><span className="avatar">{item.userDisplayNameSnapshot.slice(0, 2).toUpperCase()}</span><div><strong>{item.userDisplayNameSnapshot}</strong><small>{titleCase(item.assignmentRole)} · {titleCase(item.userRoleSnapshot)}</small></div><Status value={item.active ? 'active' : 'ended'} /><time>{shortDate(item.assignedAt)}</time></article>)}</div>{isSenior && <form className="team-assignment-form" onSubmit={assign}><select name="userSubject" required><option value="">Choose an officer</option>{portfolio.profiles.filter((item) => item.businessRole !== 'client' && item.status === 'active').map((item) => <option value={item.owner} key={item.id}>{item.displayName || item.email} · {titleCase(item.businessRole)}</option>)}</select><select name="assignmentRole"><option value="LEAD_ADVISOR">Lead advisor</option><option value="SUPPORTING_ADVISOR">Supporting advisor</option><option value="ASSESSOR">Assessor</option><option value="SPECIALIST">Specialist</option><option value="SUPERVISOR">Supervisor</option></select><button className="primary">Add to case team</button></form>}</>}
      {tab === 'documents' && <div className="case-documents">{documents.map((item) => <article key={item.id}><span>{item.mediaType.includes('pdf') ? 'PDF' : 'IMG'}</span><div><strong>{item.fileName}</strong><small>{titleCase(item.category ?? 'incident evidence')} · {(item.byteSize / 1024 / 1024).toFixed(2)} MB</small></div><Status value={item.status} /></article>)}</div>}
      {tab === 'internal' && isStaff && <><div className="internal-warning">Private staff workspace · never visible to the client</div>{claim.status === 'UNDER_ASSESSMENT' && <details className="call-log-form" open><summary>Evidence-based payout assessment</summary><form onSubmit={assess}><input name="coveredLossValue" type="number" min="0" placeholder="Evidence-supported covered loss" required /><input name="repairEstimate" type="number" min="0" placeholder="Repair estimate (optional)" /><input name="replacementEstimate" type="number" min="0" placeholder="Replacement estimate (optional)" /><input name="policyLimit" type="number" min="0" placeholder="Applicable policy limit" required /><input name="excess" type="number" min="0" placeholder="Excess" required /><input name="depreciation" type="number" min="0" max="100" placeholder="Depreciation %" required /><input name="exclusions" placeholder="Exclusions, comma separated" /><small>{documents.filter((item) => item.status === 'CLEAN').length} clean evidence files will support this assessment.</small><button className="secondary">Calculate recommendation</button></form></details>}{assessments.map((item) => <article className="assessment-card" key={item.id}><div><strong>Assessment v{item.version} · {money.format(item.recommendedPayout)}</strong><small>{titleCase(item.status)} · limit {money.format(item.policyLimit)} · excess {money.format(item.excess)}</small></div>{isSenior && item.status === 'DRAFT' && <button className="primary" onClick={() => finalizeAssessment(item.id)}>Finalize assessment</button>}</article>)}<div className="case-feed">{notes.map((item) => <article className="feed-item internal" key={item.id}><i>IN</i><div><strong>{item.authorDisplayNameSnapshot}</strong><p>{item.body}</p><small>{new Date(item.occurredAt).toLocaleString('en-ZA')}</small></div></article>)}</div><form className="case-composer" onSubmit={onInternalNote}><textarea name="body" placeholder="Add a private investigation or coordination note…" required /><button className="secondary">Save private note</button></form><details className="call-log-form"><summary>Log a phone call</summary><form onSubmit={logCall}><select name="direction"><option value="OUTBOUND">Outgoing call</option><option value="INBOUND">Incoming call</option></select><input name="participants" placeholder="Client / participants" required /><input name="startedAt" type="datetime-local" required /><select name="consentStatus"><option value="NOT_RECORDED">Not recorded</option><option value="TRANSCRIPT_CONSENTED">Transcript consented</option><option value="RECORDING_CONSENTED">Recording consented</option></select><input name="outcome" placeholder="Outcome / next step" required /><textarea name="advisorNotes" placeholder="Private advisor notes" /><button className="secondary">Save call log</button></form></details></>}
    </div>
  </section></div>;
}

function ActivityItem({ item }: { item: ClaimActivity & { kind: 'activity' } }) {
  return <article className="feed-item"><i>✓</i><div><strong>{item.summary}</strong>{item.detail && <p>{item.detail}</p>}<small>{item.actorDisplayNameSnapshot} · {new Date(item.occurredAt).toLocaleString('en-ZA')}</small></div></article>;
}
function CommunicationItem({ item }: { item: ClaimCommunication & { kind: 'communication' } }) {
  return <article className={`feed-item message ${item.direction.toLowerCase()}`}><i>{item.channel.slice(0, 2)}</i><div><strong>{item.senderDisplayNameSnapshot}</strong><p>{item.body}</p><small>{titleCase(item.channel)} · {new Date(item.occurredAt).toLocaleString('en-ZA')} · {titleCase(item.deliveryState)}</small></div></article>;
}
