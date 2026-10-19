import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CaseDrawer } from '../components/CaseFile';
import { ClaimTable, Field, PageHeader } from '../components/ui';
import { copyFor } from '../lib/copy';
import { downloadCsv } from '../lib/csv';
import { client } from '../lib/data';
import { daysSince, shortDate, titleCase } from '../lib/format';
import { assetLabel, clientName, leadAdvisor } from '../lib/portfolio';
import { roleFlags, type Access } from '../lib/roles';
import { uploadClaimFile, uploadClaimFiles } from '../lib/uploads';
import type { Claim, Portfolio } from '../types';

type Props = {
  portfolio: Portfolio; owner: string; groups: string[];
  refresh: () => Promise<void>; notify: (message: string) => void;
};
const FINISHED = ['PAID', 'CLOSED', 'REJECTED'];
const ORDER = ['ASSIGNMENT_PENDING', 'VALIDATING', 'UNDER_ASSESSMENT', 'INFO_NEEDED', 'DECISION_PENDING', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'REJECTED', 'CLOSED'];
const SORTS = [
  { value: 'waiting', label: 'Waiting longest first', staffOnly: true },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'status', label: 'Status' },
  { value: 'payout', label: 'Highest payout first' },
];

export function ClaimsPage({ portfolio, owner, groups, refresh, notify }: Props) {
  const access = roleFlags(groups);
  const { isSenior, isDeveloper, isStaff } = access;
  const copy = copyFor(access);
  const params = new URLSearchParams(window.location.search);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState(params.get('claimStatus') ?? 'ALL');
  const [query, setQuery] = useState(params.get('claimQuery') ?? '');
  const [sort, setSort] = useState(params.get('claimSort') ?? (isStaff ? 'waiting' : 'newest'));
  const [from, setFrom] = useState(params.get('claimFrom') ?? '');
  const [to, setTo] = useState(params.get('claimTo') ?? '');
  const [selected, setSelected] = useState<Claim | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    const values: Record<string, string> = { claimStatus: filter === 'ALL' ? '' : filter, claimQuery: query, claimSort: sort, claimFrom: from, claimTo: to };
    Object.entries(values).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    window.history.replaceState(null, '', `${window.location.pathname}${next.size ? `?${next}` : ''}`);
  }, [filter, query, sort, from, to]);

  const assignedIds = new Set(portfolio.assignments.filter((item) => item.active && item.userSubject === owner).map((item) => item.claimId));
  const roleClaims = isSenior || isDeveloper ? portfolio.claims : isStaff ? portfolio.claims.filter((claim) => assignedIds.has(claim.id)) : portfolio.claims;

  const claims = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (claim: Claim) => {
      if (filter === 'ACTIVE' ? FINISHED.includes(claim.status) || ['INFO_NEEDED', 'DRAFT'].includes(claim.status) : filter !== 'ALL' && claim.status !== filter) return false;
      const submitted = (claim.submittedAt ?? claim.incidentDate).slice(0, 10);
      if ((from && submitted < from) || (to && submitted > to)) return false;
      if (!needle) return true;
      return [claim.claimNumber, claim.policeCaseNumber, clientName(portfolio, claim.owner), assetLabel(portfolio, claim), titleCase(claim.claimType), leadAdvisor(portfolio, claim.id)?.userDisplayNameSnapshot]
        .some((value) => String(value ?? '').toLowerCase().includes(needle));
    };
    const byDate = (claim: Claim) => claim.submittedAt ?? claim.incidentDate;
    return roleClaims.filter(matches).sort((a, b) =>
      sort === 'waiting' ? String(a.lastActivityAt ?? '').localeCompare(String(b.lastActivityAt ?? ''))
      : sort === 'oldest' ? byDate(a).localeCompare(byDate(b))
      : sort === 'status' ? ORDER.indexOf(a.status) - ORDER.indexOf(b.status)
      : sort === 'payout' ? (b.approvedPayout ?? b.suggestedPayout ?? 0) - (a.approvedPayout ?? a.suggestedPayout ?? 0)
      : byDate(b).localeCompare(byDate(a)));
  }, [roleClaims, filter, query, sort, from, to, portfolio]);

  const clear = () => { setFilter('ALL'); setQuery(''); setFrom(''); setTo(''); setSort(isStaff ? 'waiting' : 'newest'); };
  const filtered = filter !== 'ALL' || query || from || to;

  function exportCsv() {
    downloadCsv(`claims-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Claim number', 'Client', 'Asset', 'Type', 'Status', 'Lead advisor', 'Incident date', 'Submitted', 'Last activity', 'Days since last activity'],
      ...claims.map((claim) => [claim.claimNumber, clientName(portfolio, claim.owner), assetLabel(portfolio, claim), titleCase(claim.claimType), titleCase(claim.status),
        leadAdvisor(portfolio, claim.id)?.userDisplayNameSnapshot ?? 'Unassigned', shortDate(claim.incidentDate), shortDate(claim.submittedAt), shortDate(claim.lastActivityAt), daysSince(claim.lastActivityAt)]),
    ]);
  }

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
      const evidence = form.getAll('evidence').filter((item): item is File => item instanceof File && item.size > 0);
      await uploadClaimFiles(draft.data.id, evidence, 'INCIDENT_EVIDENCE');
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
    <PageHeader eyebrow={copy.claimsEyebrow} title={heading} description={description}
      action={!isStaff && <button className="primary" onClick={() => setOpen(!open)}>＋ Start a claim</button>} />
    {open && <form className="panel claim-form" onSubmit={submit}>
      <div className="form-heading"><div><span className="eyebrow">Mandatory incident record</span><h2>Submit a new insurance claim</h2><p>Tell us what happened, then add your police report. A police case number and affidavit are required before the claim can be lodged.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close claim form">×</button></div>
      <div className="claim-form-section"><span>01</span><div><h3>What happened</h3><p>Your insurer determines a suggested payout after reviewing clean evidence, policy limits, excess and depreciation.</p><div className="form-grid compact"><Field label="Which asset is affected?" hint="Only assets with an active policy are listed. Apply for cover on the Assets page if yours is missing."><select name="assetId" required><option value="">Choose an insured asset…</option>{portfolio.assets.filter((asset) => asset.policyId).map((asset) => <option key={asset.id} value={asset.id}>{asset.description || asset.assetType}</option>)}</select></Field><Field label="What kind of incident was it?" hint="Choose the closest match. Use Other and describe it below if none fit."><select name="claimType" required><option value="accidental_damage">Accidental damage (collision, drop, spill)</option><option value="theft">Theft or attempted theft</option><option value="weather">Weather damage (hail, flood, storm)</option><option value="fire">Fire</option><option value="other">Other (describe below)</option></select></Field><Field label="When did it happen?" hint="Your best estimate is fine if you are unsure of the exact time."><input name="incidentDate" type="datetime-local" required /></Field><Field label="Where did it happen?" hint="Street, suburb and city, or the nearest landmark."><input name="incidentLocation" placeholder="e.g. N1 northbound near the Grayston off-ramp, Sandton" required /></Field><Field label="What happened?" hint="At least 10 characters. Clear detail means fewer follow-up questions." className="wide"><textarea name="description" rows={4} minLength={10} placeholder="Describe the incident in your own words: what happened, how the damage occurred and what was lost or damaged." required /></Field><Field label="Supporting evidence (optional)" hint="Photos, videos, repair quotes or receipts help your advisor decide faster. PDF, JPEG, PNG, HEIC, MP4 or MOV; you can choose several files." className="wide"><input name="evidence" type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.mp4,.mov" multiple /></Field></div></div></div>
      <div className="claim-form-section"><span>02</span><div><h3>Police report</h3><div className="form-grid compact"><Field label="Police case number (CAS number)" hint="Enter the reference exactly as the SAPS gave it to you."><input name="policeCaseNumber" placeholder="e.g. CAS 123/07/2026" required /></Field><Field label="Police affidavit or case report" hint="Upload the document the SAPS gave you. PDF, JPEG, PNG or HEIC, up to 10 MB. Your claim cannot be assessed without it."><input name="affidavit" type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif" required /></Field></div></div></div>
      <div className="form-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={sending}>{sending ? 'Securing documents…' : 'Submit claim securely'}</button></div>
    </form>}
    <CaseStats claims={roleClaims} portfolio={portfolio} access={access} label={copy.portfolioLabel} />
    <div className="filter-tabs" role="tablist" aria-label="Claim status">{copy.claimFilters.map((item) => <button role="tab" aria-selected={filter === item.value} className={filter === item.value ? 'active' : ''} onClick={() => setFilter(item.value)} key={item.value}>{item.label}</button>)}</div>
    <section className="panel claim-tools">
      <label className="search">⌕ <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isStaff ? 'Search by claim number, client, asset, advisor or police case number…' : 'Search by claim number, asset or incident type…'} aria-label="Search claims" /></label>
      <div className="tool-row">
        <Field label="Sort by"><select value={sort} onChange={(event) => setSort(event.target.value)}>{SORTS.filter((item) => isStaff || !item.staffOnly).map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></Field>
        <Field label="Submitted from"><input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></Field>
        <Field label="Submitted to"><input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></Field>
        <div className="tool-actions"><strong>{claims.length} {claims.length === 1 ? 'claim' : 'claims'}</strong>{filtered && <button className="text-button" onClick={clear}>Clear filters</button>}{isStaff && <button className="secondary" onClick={exportCsv} disabled={!claims.length}>Export CSV</button>}</div>
      </div>
    </section>
    <section className="panel table-panel"><ClaimTable claims={claims} onSelect={setSelected} access={access} portfolio={portfolio} /></section>
    {selected && <CaseDrawer claim={portfolio.claims.find((item) => item.id === selected.id) ?? selected} portfolio={portfolio} owner={owner} access={access} onClose={() => setSelected(null)} refresh={refresh} notify={notify} />}
  </>;
}

function CaseStats({ claims, portfolio, access, label }: { claims: Claim[]; portfolio: Portfolio; access: Access; label: string }) {
  const waiting = claims.filter((item) => item.status === 'INFO_NEEDED').length;
  if (access.isClient) {
    return <div className="case-stats"><div><small>{label}</small><strong>{claims.length}</strong></div><div className={waiting ? 'attention' : ''}><small>Waiting on you</small><strong>{waiting}</strong></div><div><small>In progress</small><strong>{claims.filter((item) => !FINISHED.includes(item.status) && item.status !== 'INFO_NEEDED').length}</strong></div><div><small>Paid out</small><strong>{claims.filter((item) => item.status === 'PAID' || item.status === 'CLOSED').length}</strong></div></div>;
  }
  return <div className="case-stats"><div><small>{label}</small><strong>{claims.length}</strong></div><div><small>Needs client response</small><strong>{waiting}</strong></div><div><small>Decision pending</small><strong>{claims.filter((item) => item.status === 'DECISION_PENDING').length}</strong></div><div><small>Unassigned</small><strong>{claims.filter((claim) => !leadAdvisor(portfolio, claim.id)).length}</strong></div></div>;
}
