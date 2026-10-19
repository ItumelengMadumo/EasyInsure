import { FormEvent, useState } from 'react';
import { CaseDrawer } from '../components/CaseFile';
import { ClaimTable, Field, PageHeader } from '../components/ui';
import { client, uploadQuarantined } from '../lib/data';
import { titleCase } from '../lib/format';
import { roleFlags } from '../lib/roles';
import type { Claim, Portfolio } from '../types';

type Props = {
  portfolio: Portfolio; owner: string; groups: string[];
  refresh: () => Promise<void>; notify: (message: string) => void;
};

async function uploadClaimFile(claimId: string, file: File, category: string) {
  const { objectKey, checksum } = await uploadQuarantined(`${claimId}`, file);
  const document = await client.mutations.registerClaimDocument({
    claimId, objectKey, fileName: file.name, mediaType: file.type, byteSize: file.size,
    checksum, category, correlationId: crypto.randomUUID(),
  });
  if (document.errors?.length) throw new Error(document.errors[0].message);
}

export function ClaimsPage({ portfolio, owner, groups, refresh, notify }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [selected, setSelected] = useState<Claim | null>(null);
  const [sending, setSending] = useState(false);
  const access = roleFlags(groups);
  const { isSenior, isDeveloper, isStaff } = access;
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
      await uploadClaimFile(draft.data.id, affidavit, 'AFFIDAVIT');
      const evidence = form.get('evidence');
      if (evidence instanceof File && evidence.size) await uploadClaimFile(draft.data.id, evidence, 'INCIDENT_EVIDENCE');
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
      <div className="claim-form-section"><span>01</span><div><h3>Police report</h3><div className="form-grid compact"><Field label="Police case number (CAS number)" hint="Enter the reference exactly as the SAPS gave it to you."><input name="policeCaseNumber" placeholder="e.g. CAS 123/07/2026" required /></Field><Field label="Police affidavit or case report" hint="Upload the document the SAPS gave you. PDF, JPEG or PNG, up to 10 MB. Your claim cannot be assessed without it."><input name="affidavit" type="file" accept=".pdf,.jpg,.jpeg,.png" required /></Field></div></div></div>
      <div className="claim-form-section"><span>02</span><div><h3>Incident and cover</h3><p>Your insurer determines a suggested payout after reviewing clean evidence, policy limits, excess and depreciation.</p><div className="form-grid compact"><Field label="Which asset is affected?" hint="Only assets with an active policy are listed. Apply for cover on the Assets page if yours is missing."><select name="assetId" required><option value="">Choose an insured asset…</option>{portfolio.assets.filter((asset) => asset.policyId).map((asset) => <option key={asset.id} value={asset.id}>{asset.description || asset.assetType}</option>)}</select></Field><Field label="What kind of incident was it?" hint="Choose the closest match. Use Other and describe it below if none fit."><select name="claimType" required><option value="accidental_damage">Accidental damage (collision, drop, spill)</option><option value="theft">Theft or attempted theft</option><option value="weather">Weather damage (hail, flood, storm)</option><option value="fire">Fire</option><option value="other">Other (describe below)</option></select></Field><Field label="When did it happen?" hint="Your best estimate is fine if you are unsure of the exact time."><input name="incidentDate" type="datetime-local" required /></Field><Field label="Where did it happen?" hint="Street, suburb and city, or the nearest landmark."><input name="incidentLocation" placeholder="e.g. N1 northbound near the Grayston off-ramp, Sandton" required /></Field><Field label="Supporting evidence (optional)" hint="Photos of the damage, repair quotes, receipts or witness details help your advisor decide faster. PDF, JPEG or PNG, up to 10 MB."><input name="evidence" type="file" accept=".pdf,.jpg,.jpeg,.png" /></Field><Field label="What happened?" hint="At least 10 characters. Clear detail means fewer follow-up questions."><textarea name="description" rows={4} minLength={10} placeholder="Describe the incident in your own words: what happened, how the damage occurred and what was lost or damaged." required /></Field></div></div></div>
      <div className="form-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={sending}>{sending ? 'Securing documents…' : 'Submit claim securely'}</button></div>
    </form>}
    <CaseStats claims={roleClaims} assignments={portfolio.assignments} isSenior={isSenior} />
    <div className="filter-tabs">{['ALL', 'ASSIGNMENT_PENDING', 'VALIDATING', 'UNDER_ASSESSMENT', 'INFO_NEEDED', 'DECISION_PENDING', 'APPROVED', 'PAID', 'CLOSED'].map((status) => <button className={filter === status ? 'active' : ''} onClick={() => setFilter(status)} key={status}>{status === 'ALL' ? 'All cases' : titleCase(status)}</button>)}</div>
    <section className="panel table-panel"><ClaimTable claims={claims} onSelect={setSelected} /></section>
    {selected && <CaseDrawer claim={portfolio.claims.find((item) => item.id === selected.id) ?? selected} portfolio={portfolio} owner={owner} access={access} onClose={() => setSelected(null)} refresh={refresh} notify={notify} />}
  </>;
}

function CaseStats({ claims, assignments, isSenior }: { claims: Claim[]; assignments: Portfolio['assignments']; isSenior: boolean }) {
  return <div className="case-stats"><div><small>{isSenior ? 'Total portfolio' : 'My portfolio'}</small><strong>{claims.length}</strong></div><div><small>Needs client response</small><strong>{claims.filter((item) => item.status === 'INFO_NEEDED').length}</strong></div><div><small>Decision pending</small><strong>{claims.filter((item) => item.status === 'DECISION_PENDING').length}</strong></div><div><small>Unassigned</small><strong>{claims.filter((claim) => !assignments.some((item) => item.claimId === claim.id && item.active && item.isLead)).length}</strong></div></div>;
}

