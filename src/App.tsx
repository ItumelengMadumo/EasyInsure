import { FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { Authenticator, Button, Loader } from '@aws-amplify/ui-react';
import { getCurrentUser } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import { uploadData } from 'aws-amplify/storage';
const client: any = generateClient();
type Page = 'overview' | 'assets' | 'claims' | 'review';
type Asset = { id: string; assetType: string; description?: string | null; purchasePrice: number; purchaseDate: string; condition: string; policyId?: string | null };
type Claim = { id: string; claimNumber: string; claimType: string; incidentDate: string; amountRequested: number; status: string; tier?: number | null; fraudFlag?: boolean | null };

const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });

function Shell({ signOut }: { signOut?: () => void }) {
  const [page, setPage] = useState<Page>('overview');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setBusy(true);
    const [{ data: assetData, errors: assetErrors }, { data: claimData, errors: claimErrors }] = await Promise.all([
      client.models.Asset.list({}), client.models.Claim.list({}),
    ]);
    if (assetErrors?.length || claimErrors?.length) setNotice('Some portfolio data could not be loaded.');
    setAssets(assetData ?? []);
    setClaims(claimData ?? []);
    setBusy(false);
  }, []);

  useEffect(() => {
    void getCurrentUser().then((user) => {
      setOwner(user.userId);
      return refresh();
    }).catch(() => setNotice('Unable to resolve your identity.'));
    const sub = client.models.Claim.onUpdate({}).subscribe({ next: () => void refresh(), error: () => setNotice('Live claim updates disconnected.') });
    return () => sub.unsubscribe();
  }, [refresh]);

  const pending = claims.filter((claim) => ['SUBMITTED', 'PROCESSING', 'REVIEW'].includes(claim.status)).length;
  const flagged = claims.filter((claim) => claim.fraudFlag).length;

  async function createAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await client.models.Asset.create({
      owner, assetType: String(form.get('assetType')), description: String(form.get('description')),
      purchasePrice: Number(form.get('purchasePrice')), purchaseDate: new Date(String(form.get('purchaseDate'))).toISOString(),
      condition: String(form.get('condition')),
    });
    if (result.errors?.length) setNotice(result.errors[0].message);
    else { event.currentTarget.reset(); setNotice('Asset registered.'); await refresh(); }
  }

  async function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const asset = assets.find((item) => item.id === form.get('assetId'));
    if (!asset?.policyId) { setNotice('The selected asset must be linked to an active policy.'); return; }
    const idempotencyKey = crypto.randomUUID();
    const result = await client.mutations.submitClaim({
      policyId: asset.policyId, assetId: asset.id,
      claimType: String(form.get('claimType')), description: String(form.get('description')),
      incidentDate: new Date(String(form.get('incidentDate'))).toISOString(), incidentLocation: String(form.get('incidentLocation')),
      amountRequested: Number(form.get('amountRequested')), idempotencyKey, correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length || !result.data) { setNotice(result.errors?.[0]?.message ?? 'Claim submission failed.'); return; }
    const file = form.get('evidence');
    if (file instanceof File && file.size) {
      if (file.size > 10 * 1024 * 1024) { setNotice('Claim saved, but evidence exceeds the 10 MB limit.'); return; }
      const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!allowed.includes(file.type)) { setNotice('Claim saved, but only PDF, JPEG, and PNG evidence is accepted.'); return; }
      const objectKey = `quarantine/${owner}/${result.data.id}/${crypto.randomUUID()}-${file.name}`;
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      await uploadData({ path: objectKey, data: file, options: { contentType: file.type } }).result;
      const document = await client.models.ClaimDocument.create({
        owner, claimId: result.data.id, objectKey, fileName: file.name, mediaType: file.type,
        byteSize: file.size, checksum, status: 'QUARANTINED', uploadedBy: owner,
      });
      if (document.errors?.length) setNotice('Claim and evidence uploaded, but evidence metadata registration failed.');
    }
    formElement.reset(); setNotice('Claim submitted for asynchronous processing.'); await refresh();
  }

  const content = busy ? <div className="center"><Loader size="large" /></div> : page === 'assets' ? (
    <section><Header eyebrow="Portfolio" title="Insured assets" description="Register and track the items protected by your policies." />
      <div className="split"><form className="panel form" onSubmit={createAsset}><h3>Register asset</h3><Field label="Type"><select name="assetType" required><option value="vehicle">Vehicle</option><option value="property">Property</option><option value="electronics">Electronics</option><option value="furniture">Furniture</option><option value="machinery">Machinery</option></select></Field><Field label="Description"><input name="description" required /></Field><Field label="Purchase value"><input name="purchasePrice" type="number" min="0" step="0.01" required /></Field><Field label="Purchase date"><input name="purchaseDate" type="date" required /></Field><Field label="Condition"><select name="condition"><option>excellent</option><option>average</option><option>poor</option></select></Field><button className="primary">Register asset</button></form>
      <div className="cards">{assets.map((asset) => <article className="asset-card" key={asset.id}><span className="pill">{asset.assetType}</span><h3>{asset.description || 'Unnamed asset'}</h3><strong>{money.format(asset.purchasePrice)}</strong><p>{asset.condition} condition</p><small>{asset.policyId ? 'Policy linked' : 'Not yet insured'}</small></article>)}</div></div></section>
  ) : page === 'claims' ? (
    <section><Header eyebrow="Claims" title="Submit and track" description="Every recommendation remains subject to human approval." />
      <div className="split"><form className="panel form" onSubmit={submitClaim}><h3>New claim</h3><Field label="Asset"><select name="assetId" required><option value="">Select an asset</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.description || asset.assetType}</option>)}</select></Field><Field label="Claim type"><input name="claimType" required /></Field><Field label="Description"><textarea name="description" rows={4} required /></Field><Field label="Incident date"><input name="incidentDate" type="datetime-local" required /></Field><Field label="Location"><input name="incidentLocation" /></Field><Field label="Amount requested"><input name="amountRequested" type="number" min="0" step="0.01" required /></Field><Field label="Evidence (PDF, JPEG or PNG; 10 MB)"><input name="evidence" type="file" accept=".pdf,.jpg,.jpeg,.png" /></Field><button className="primary">Submit claim</button></form><ClaimTable claims={claims} /></div></section>
  ) : page === 'review' ? (
    <section><Header eyebrow="Human review" title="Decision workspace" description="AI output is advisory; authorized officers make every final decision." /><ClaimTable claims={claims.filter((claim) => claim.status === 'REVIEW')} /></section>
  ) : (
    <section><Header eyebrow="Operations overview" title="Claims you can explain." description="Deterministic calculations, evidence-aware AI assistance, and a human approval gate." /><div className="metrics"><Metric value={assets.length} label="Assets" /><Metric value={claims.length} label="Claims" /><Metric value={pending} label="Awaiting review" /><Metric value={flagged} label="Rule flagged" tone="alert" /></div><div className="panel"><div className="panel-title"><div><span className="eyebrow">Live portfolio</span><h2>Recent claims</h2></div><button className="secondary" onClick={() => setPage('claims')}>View all</button></div><ClaimTable claims={claims.slice(0, 6)} /></div></section>
  );

  return <div className="app"><aside><div className="brand"><span>EI</span><div><strong>EasyInsure</strong><small>Claims intelligence</small></div></div><nav>{([['overview','Overview'],['assets','Assets'],['claims','Claims'],['review','Review queue']] as [Page,string][]).map(([key,label]) => <button className={page === key ? 'active' : ''} key={key} onClick={() => setPage(key)}>{label}</button>)}</nav><div className="trust"><strong>Human controlled</strong><p>AI never approves payouts.</p></div><Button variation="link" onClick={signOut}>Sign out</Button></aside><main><header className="topbar"><span className="environment">US East · secure workspace</span><span className="avatar">{owner.slice(0, 2).toUpperCase()}</span></header>{notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')}>×</button></div>}{content}</main></div>;
}

function Header({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <header className="page-head"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></header>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Metric({ value, label, tone = '' }: { value: number; label: string; tone?: string }) { return <article className={`metric ${tone}`}><strong>{value}</strong><span>{label}</span></article>; }
function ClaimTable({ claims }: { claims: Claim[] }) { return <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Type</th><th>Requested</th><th>Tier</th><th>Status</th></tr></thead><tbody>{claims.length ? claims.map((claim) => <tr key={claim.id}><td><strong>{claim.claimNumber}</strong><small>{new Date(claim.incidentDate).toLocaleDateString('en-ZA')}</small></td><td>{claim.claimType}</td><td>{money.format(claim.amountRequested)}</td><td>{claim.tier ?? '—'}</td><td><span className={`status ${claim.status.toLowerCase()}`}>{claim.status}</span></td></tr>) : <tr><td colSpan={5} className="empty">No claims in this view.</td></tr>}</tbody></table></div>; }

export default function App() {
  return <Authenticator loginMechanisms={['email']} signUpAttributes={['preferred_username']}><Shell /></Authenticator>;
}
