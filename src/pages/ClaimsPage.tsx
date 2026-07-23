import { FormEvent, useState } from 'react';
import { uploadData } from 'aws-amplify/storage';
import { ClaimTable, Field, PageHeader } from '../components/ui';
import { client } from '../lib/data';
import type { Claim, Portfolio } from '../types';

type Props = { portfolio: Portfolio; owner: string; refresh: () => Promise<void>; notify: (message: string) => void };
export function ClaimsPage({ portfolio, owner, refresh, notify }: Props) {
  const [open, setOpen] = useState(false); const [filter, setFilter] = useState('ALL'); const [selected, setSelected] = useState<Claim | null>(null);
  const claims = filter === 'ALL' ? portfolio.claims : portfolio.claims.filter((claim) => claim.status === filter);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const asset = portfolio.assets.find((item) => item.id === form.get('assetId'));
    if (!asset?.policyId) return notify('Select an asset linked to an active policy.');
    const result = await client.mutations.submitClaim({ policyId: asset.policyId, assetId: asset.id, claimType: String(form.get('claimType')), description: String(form.get('description')), incidentDate: new Date(String(form.get('incidentDate'))).toISOString(), incidentLocation: String(form.get('incidentLocation')), amountRequested: Number(form.get('amountRequested')), idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() });
    if (result.errors?.length || !result.data) return notify(result.errors?.[0]?.message ?? 'Claim submission failed.');
    const file = form.get('evidence');
    if (file instanceof File && file.size) {
      if (file.size > 10 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) return notify('Claim saved. Evidence must be PDF, JPEG or PNG and under 10 MB.');
      const objectKey = `quarantine/${owner}/${result.data.id}/${crypto.randomUUID()}-${file.name}`; const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer()); const checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      await uploadData({ path: objectKey, data: file, options: { contentType: file.type } }).result;
      await client.models.ClaimDocument.create({ owner, claimId: result.data.id, objectKey, fileName: file.name, mediaType: file.type, byteSize: file.size, checksum, status: 'QUARANTINED', uploadedBy: owner });
    }
    notify('Claim submitted for secure processing.'); setOpen(false); await refresh();
  }
  return <>
    <PageHeader eyebrow="Claims centre" title="From incident to outcome." description="Submit evidence, follow each stage and see exactly how recommendations were formed." action={<button className="primary" onClick={() => setOpen(!open)}>＋ Start a claim</button>} />
    {open && <form className="panel form-grid" onSubmit={submit}><div className="form-heading"><div><span className="eyebrow">Guided submission</span><h2>Tell us what happened</h2></div><button type="button" className="icon-button" onClick={() => setOpen(false)}>×</button></div><Field label="Covered asset"><select name="assetId" required><option value="">Select an insured asset</option>{portfolio.assets.filter((asset) => asset.policyId).map((asset) => <option key={asset.id} value={asset.id}>{asset.description || asset.assetType}</option>)}</select></Field><Field label="Incident type"><select name="claimType" required><option value="accidental_damage">Accidental damage</option><option value="theft">Theft</option><option value="weather">Weather damage</option><option value="fire">Fire</option><option value="other">Other</option></select></Field><Field label="Incident date"><input name="incidentDate" type="datetime-local" required /></Field><Field label="Location"><input name="incidentLocation" placeholder="Where did this happen?" /></Field><Field label="Amount requested"><input name="amountRequested" type="number" min="0" step=".01" required /></Field><Field label="Evidence" hint="PDF, JPEG or PNG · maximum 10 MB"><input name="evidence" type="file" accept=".pdf,.jpg,.jpeg,.png" /></Field><Field label="Incident description"><textarea name="description" rows={4} placeholder="Describe what happened in your own words…" required /></Field><div className="form-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Save for later</button><button className="primary">Submit securely</button></div></form>}
    <div className="filter-tabs">{['ALL', 'SUBMITTED', 'PROCESSING', 'REVIEW', 'APPROVED', 'REJECTED'].map((status) => <button className={filter === status ? 'active' : ''} onClick={() => setFilter(status)} key={status}>{status === 'ALL' ? 'All claims' : status.toLowerCase()}</button>)}</div>
    <section className="panel table-panel"><ClaimTable claims={claims} onSelect={setSelected} /></section>
    {selected && <div className="drawer-backdrop" onClick={() => setSelected(null)}><aside className="detail-drawer" onClick={(event) => event.stopPropagation()}><button className="icon-button close" onClick={() => setSelected(null)}>×</button><span className="eyebrow">{selected.claimNumber}</span><h2>{selected.claimType.replaceAll('_', ' ')}</h2><p>{selected.description}</p><div className="timeline">{['Claim submitted', selected.status === 'SUBMITTED' ? 'Awaiting processing' : 'Deterministic checks complete', selected.status === 'REVIEW' ? 'Human review required' : selected.status].map((item, index) => <div className={index === 2 ? 'current' : ''} key={item}><i>{index + 1}</i><span><strong>{item}</strong><small>{index === 2 ? 'No financial decision is automated.' : 'Recorded in the audit trail.'}</small></span></div>)}</div></aside></div>}
  </>;
}
