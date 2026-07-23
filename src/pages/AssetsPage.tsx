import { FormEvent, useState } from 'react';
import { Field, PageHeader, EmptyState } from '../components/ui';
import { client } from '../lib/data';
import { money, shortDate, titleCase } from '../lib/format';
import type { Portfolio } from '../types';

type Props = { portfolio: Portfolio; owner: string; refresh: () => Promise<void>; notify: (message: string) => void };
export function AssetsPage({ portfolio, owner, refresh, notify }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = portfolio.assets.filter((item) => `${item.description} ${item.assetType} ${item.make} ${item.model}`.toLowerCase().includes(query.toLowerCase()));
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const result = await client.models.Asset.create({ owner, assetType: String(form.get('assetType')), description: String(form.get('description')), purchasePrice: Number(form.get('purchasePrice')), purchaseDate: new Date(String(form.get('purchaseDate'))).toISOString(), condition: String(form.get('condition')), make: String(form.get('make')) || undefined, model: String(form.get('model')) || undefined, serialNumber: String(form.get('serialNumber')) || undefined });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Asset registered successfully.'); setOpen(false); await refresh(); }
  }
  return <>
    <PageHeader eyebrow="Asset register" title="What you protect." description="A complete inventory of insured and cover-ready assets." action={<button className="primary" onClick={() => setOpen(!open)}>＋ Register asset</button>} />
    {open && <form className="panel form-grid" onSubmit={create}><div className="form-heading"><div><h2>Register a new asset</h2><p>Add its ownership and valuation details.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)}>×</button></div><Field label="Asset type"><select name="assetType" required><option value="vehicle">Vehicle</option><option value="property">Property</option><option value="electronics">Electronics</option><option value="furniture">Furniture</option><option value="machinery">Machinery</option></select></Field><Field label="Description"><input name="description" placeholder="e.g. Family SUV" required /></Field><Field label="Make"><input name="make" placeholder="Optional" /></Field><Field label="Model"><input name="model" placeholder="Optional" /></Field><Field label="Purchase value"><input name="purchasePrice" type="number" min="0" step=".01" required /></Field><Field label="Purchase date"><input name="purchaseDate" type="date" required /></Field><Field label="Condition"><select name="condition"><option>excellent</option><option>average</option><option>poor</option></select></Field><Field label="Serial / VIN"><input name="serialNumber" placeholder="Optional" /></Field><div className="form-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary">Save asset</button></div></form>}
    <div className="toolbar"><label className="search">⌕ <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search assets…" /></label><span>{filtered.length} assets</span></div>
    {filtered.length ? <div className="asset-grid">{filtered.map((asset) => <article className="asset-card" key={asset.id}><div className={`asset-visual ${asset.assetType}`}><span>{asset.assetType === 'vehicle' ? '◇' : asset.assetType === 'property' ? '⌂' : '▣'}</span><StatusDot linked={Boolean(asset.policyId)} /></div><div className="asset-body"><span className="eyebrow">{titleCase(asset.assetType)}</span><h3>{asset.description || 'Unnamed asset'}</h3><p>{[asset.make, asset.model].filter(Boolean).join(' ') || `${titleCase(asset.condition)} condition`}</p><div className="asset-facts"><span><small>Purchase value</small><strong>{money.format(asset.purchasePrice)}</strong></span><span><small>Acquired</small><strong>{shortDate(asset.purchaseDate)}</strong></span></div><div className="asset-footer"><span className={asset.policyId ? 'cover active' : 'cover'}>{asset.policyId ? '● Policy linked' : '○ Cover needed'}</span><button className="text-button">Details →</button></div></div></article>)}</div> : <EmptyState title="No assets found" copy="Register an asset to start building your protected portfolio." />}
  </>;
}
function StatusDot({ linked }: { linked: boolean }) { return <span className={`visual-status ${linked ? 'linked' : ''}`}>{linked ? 'Covered' : 'Unlinked'}</span>; }
