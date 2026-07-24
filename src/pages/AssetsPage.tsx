import { FormEvent, useState } from 'react';
import { Field, PageHeader, EmptyState } from '../components/ui';
import { client } from '../lib/data';
import { money, shortDate, titleCase } from '../lib/format';
import type { Portfolio } from '../types';

type Props = { portfolio: Portfolio; owner: string; refresh: () => Promise<void>; notify: (message: string) => void };
const categories = [
  { value: 'vehicle', icon: '◇', label: 'Vehicle', note: 'Cars, motorcycles and commercial vehicles' },
  { value: 'property', icon: '⌂', label: 'Property', note: 'Homes, buildings and structures' },
  { value: 'electronics', icon: '▣', label: 'Electronics', note: 'Computers, cameras and appliances' },
  { value: 'furniture', icon: '▱', label: 'Furniture', note: 'Home and office furnishings' },
  { value: 'machinery', icon: '⚙', label: 'Machinery', note: 'Tools and operational equipment' },
];

export function AssetsPage({ portfolio, owner, refresh, notify }: Props) {
  const [open, setOpen] = useState(false); const [step, setStep] = useState(1); const [assetType, setAssetType] = useState('vehicle'); const [query, setQuery] = useState('');
  const filtered = portfolio.assets.filter((item) => `${item.description} ${item.assetType} ${item.make} ${item.model}`.toLowerCase().includes(query.toLowerCase()));
  function close() { setOpen(false); setStep(1); }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const number = (key: string) => form.get(key) ? Number(form.get(key)) : undefined;
    const text = (key: string) => String(form.get(key) || '') || undefined;
    const result = await client.models.Asset.create({
      owner, assetType, description: text('description'), purchasePrice: Number(form.get('purchasePrice')), purchaseDate: new Date(String(form.get('purchaseDate'))).toISOString(),
      condition: String(form.get('condition')), make: text('make'), model: text('model'), year: number('year'), serialNumber: text('serialNumber'),
      registrationNumber: text('registrationNumber'), vin: text('vin'), mileageKm: number('mileageKm'), address: text('address'),
      squareFootage: number('squareFootage'), constructionType: text('constructionType'), roofType: text('roofType'), occupancyType: text('occupancyType'),
      securityFeatures: text('securityFeatures'), purchaseSource: text('purchaseSource'), assetUse: text('assetUse'), portable: form.get('portable') === 'yes',
    });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Asset registered. It is ready to be assessed for cover.'); close(); await refresh(); }
  }
  return <>
    <PageHeader eyebrow="Asset register" title="What you protect." description="Record enough detail to identify, value and eventually price cover for every asset." action={<button className="primary" onClick={() => setOpen(true)}>＋ Register asset</button>} />
    {open && <div className="wizard-backdrop"><form className="asset-wizard" onSubmit={create}>
      <header><div><span className="eyebrow">Asset registration</span><h2>{step === 1 ? 'Choose an asset category' : step === 2 ? `Tell us about the ${assetType}` : 'Ownership and value'}</h2><p>{step === 1 ? 'The category determines which details we need next.' : step === 2 ? 'These details help identify and assess the asset accurately.' : 'Add the information needed for valuation and future cover.'}</p></div><button type="button" className="icon-button" onClick={close}>×</button></header>
      <div className="wizard-progress">{[1, 2, 3].map((item) => <div className={step >= item ? 'active' : ''} key={item}><span>{step > item ? '✓' : item}</span><small>{item === 1 ? 'Category' : item === 2 ? 'Asset details' : 'Value & use'}</small></div>)}</div>
      <div className="wizard-body">
        {step === 1 && <div className="category-grid">{categories.map((category) => <button type="button" className={assetType === category.value ? 'selected' : ''} onClick={() => setAssetType(category.value)} key={category.value}><i>{category.icon}</i><span><strong>{category.label}</strong><small>{category.note}</small></span><b>→</b></button>)}</div>}
        {step === 2 && <div className="wizard-fields"><Field label="Short description"><input name="description" placeholder={assetType === 'vehicle' ? 'e.g. Silver family SUV' : assetType === 'property' ? 'e.g. Primary residence' : 'e.g. Work laptop'} required /></Field>
          {assetType === 'vehicle' && <><Field label="Make"><input name="make" placeholder="e.g. Toyota" required /></Field><Field label="Model"><input name="model" placeholder="e.g. Corolla Cross" required /></Field><Field label="Model year"><input name="year" type="number" min="1950" max="2030" required /></Field><Field label="Registration number"><input name="registrationNumber" placeholder="e.g. CA 123-456" /></Field><Field label="VIN"><input name="vin" placeholder="17-character vehicle identifier" /></Field><Field label="Current mileage (km)"><input name="mileageKm" type="number" min="0" /></Field></>}
          {assetType === 'property' && <><Field label="Property address"><input name="address" placeholder="Street, suburb, city" required /></Field><Field label="Floor area (m²)"><input name="squareFootage" type="number" min="1" required /></Field><Field label="Construction type"><select name="constructionType"><option>Brick and mortar</option><option>Concrete</option><option>Timber</option><option>Mixed construction</option></select></Field><Field label="Roof type"><select name="roofType"><option>Tile</option><option>Metal</option><option>Thatch</option><option>Concrete</option></select></Field><Field label="Occupancy"><select name="occupancyType"><option>Owner occupied</option><option>Tenant occupied</option><option>Holiday home</option><option>Commercial use</option></select></Field><Field label="Security features"><input name="securityFeatures" placeholder="Alarm, beams, access control…" /></Field></>}
          {['electronics', 'furniture', 'machinery'].includes(assetType) && <><Field label="Manufacturer / brand"><input name="make" placeholder="Brand or manufacturer" required /></Field><Field label="Model / range"><input name="model" placeholder="Model name or number" /></Field><Field label="Serial number"><input name="serialNumber" placeholder="Where available" /></Field><Field label="Year manufactured"><input name="year" type="number" min="1950" max="2030" /></Field>{assetType !== 'furniture' && <Field label="Portable asset?"><select name="portable"><option value="no">No, normally stays on site</option><option value="yes">Yes, regularly taken off site</option></select></Field>}<Field label="Security / storage"><input name="securityFeatures" placeholder="Safe, tracking, secured room…" /></Field></>}
        </div>}
        {step === 3 && <div className="wizard-fields"><Field label="Purchase or replacement value (ZAR)" hint="Use the amount supported by your invoice or most recent valuation."><input name="purchasePrice" type="number" min="0" step=".01" required /></Field><Field label="Purchase date"><input name="purchaseDate" type="date" required /></Field><Field label="Current condition"><select name="condition"><option value="excellent">Excellent — like new</option><option value="average">Average — normal wear</option><option value="poor">Poor — visible wear or damage</option></select></Field><Field label="How is it used?"><select name="assetUse"><option>Personal</option><option>Business</option><option>Mixed personal and business</option><option>Rental or leased use</option></select></Field><Field label="Where was it purchased?"><input name="purchaseSource" placeholder="Dealer, retailer, private seller…" /></Field><div className="pricing-preview"><span>Coming next</span><strong>Cover pricing for this asset</strong><p>Once underwriting rules are connected to asset registration, this step will show an indicative premium before you request cover.</p></div></div>}
      </div>
      <footer><button type="button" className="secondary" onClick={() => step === 1 ? close() : setStep(step - 1)}>{step === 1 ? 'Cancel' : '← Back'}</button>{step < 3 ? <button type="button" className="primary" onClick={() => setStep(step + 1)}>Continue →</button> : <button className="primary">Register asset</button>}</footer>
    </form></div>}
    <div className="toolbar"><label className="search">⌕ <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search assets…" /></label><span>{filtered.length} assets</span></div>
    {filtered.length ? <div className="asset-grid">{filtered.map((asset) => <article className="asset-card" key={asset.id}><div className={`asset-visual ${asset.assetType}`}><span>{categories.find((item) => item.value === asset.assetType)?.icon ?? '◇'}</span><span className={`visual-status ${asset.policyId ? 'linked' : ''}`}>{asset.policyId ? 'Covered' : 'Unlinked'}</span></div><div className="asset-body"><span className="eyebrow">{titleCase(asset.assetType)}</span><h3>{asset.description || 'Unnamed asset'}</h3><p>{[asset.make, asset.model, asset.year].filter(Boolean).join(' ') || `${titleCase(asset.condition)} condition`}</p><div className="asset-facts"><span><small>Recorded value</small><strong>{money.format(asset.purchasePrice)}</strong></span><span><small>Acquired</small><strong>{shortDate(asset.purchaseDate)}</strong></span></div><div className="asset-footer"><span className={asset.policyId ? 'cover active' : 'cover'}>{asset.policyId ? '● Policy linked' : '○ Cover needed'}</span><button className="text-button">Details →</button></div></div></article>)}</div> : <EmptyState title="No assets found" copy="Register an asset to start building your protected portfolio." />}
  </>;
}
