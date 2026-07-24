import { FormEvent, useEffect, useState } from 'react';
import { uploadData } from 'aws-amplify/storage';
import { EmptyState, Field, PageHeader, Status } from '../components/ui';
import { client } from '../lib/data';
import { money, shortDate, titleCase } from '../lib/format';
import type { Portfolio } from '../types';

type Props = { portfolio: Portfolio; owner: string; refresh: () => Promise<void>; notify: (message: string) => void };
type DefinitionField = { key: string; label: string; section: string; type: string; required?: boolean; options?: string[] };
type Definitions = Record<string, { assetType: string; schemaVersion: string; fields: DefinitionField[] }>;
const categories = [
  ['vehicle', 'Vehicle', 'Cars, motorcycles and commercial vehicles'],
  ['property', 'Property', 'Homes, buildings and structures'],
  ['electronics', 'Electronics', 'Computers, cameras, phones and appliances'],
  ['furniture', 'Furniture & valuables', 'Furniture, art, collections and valuable contents'],
  ['machinery', 'Machinery', 'Tools, plant and operational equipment'],
];
const steps = ['category', 'ownership', 'identity', 'specifications', 'condition', 'usage', 'security', 'valuation', 'risk', 'review'];

export function AssetsPage({ portfolio, owner, refresh, notify }: Props) {
  const [definitions, setDefinitions] = useState<Definitions>({});
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [assetType, setAssetType] = useState('vehicle');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const [query, setQuery] = useState(params.get('assetQuery') ?? '');
  const [category, setCategory] = useState(params.get('assetType') ?? '');
  const [status, setStatus] = useState(params.get('assetStatus') ?? '');
  const [cover, setCover] = useState(params.get('cover') ?? '');
  const [condition, setCondition] = useState(params.get('condition') ?? '');
  const [minValue, setMinValue] = useState(params.get('minValue') ?? '');
  const [maxValue, setMaxValue] = useState(params.get('maxValue') ?? '');
  const [premiumMin, setPremiumMin] = useState(params.get('premiumMin') ?? '');
  const [premiumMax, setPremiumMax] = useState(params.get('premiumMax') ?? '');
  const [sort, setSort] = useState(params.get('assetSort') ?? 'newest');

  useEffect(() => {
    client.queries.getAssetCategoryDefinitions({}).then((result: any) => {
      if (result.errors?.length) throw new Error(result.errors[0].message);
      if (result.data) setDefinitions((typeof result.data === 'string' ? JSON.parse(result.data) : result.data) as Definitions);
    }).catch((error: unknown) => notify(error instanceof Error ? `Asset form unavailable: ${error.message}` : 'Asset form unavailable.'));
  }, [notify]);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    const values = { assetQuery: query, assetType: category, assetStatus: status, cover, condition, minValue, maxValue, premiumMin, premiumMax, assetSort: sort };
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    window.history.replaceState(null, '', `${window.location.pathname}?${next.toString()}`);
  }, [query, category, status, cover, condition, minValue, maxValue, premiumMin, premiumMax, sort]);

  const assets = Array.isArray(portfolio.assets) ? portfolio.assets : [];
  const applications = Array.isArray(portfolio.applications) ? portfolio.applications : [];
  const premiumAssessments = Array.isArray(portfolio.premiumAssessments) ? portfolio.premiumAssessments : [];
  const filtered = assets.filter((item) => {
    const application = applications.find((entry) => entry.assetId === item.id);
    const assessment = premiumAssessments.find((entry) => entry.id === application?.latestAssessmentId);
    const haystack = `${item.searchText ?? ''} ${item.description} ${item.assetType} ${item.make} ${item.model} ${item.serialNumber} ${item.vin} ${item.registrationNumber} ${item.address} ${application?.applicationNumber ?? ''}`.toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) &&
      (!category || item.assetType === category) && (!status || item.status === status) &&
      (!cover || (cover === 'COVERED' ? Boolean(item.policyId) : !item.policyId)) &&
      (!condition || item.condition === condition) && (!minValue || item.purchasePrice >= Number(minValue)) &&
      (!maxValue || item.purchasePrice <= Number(maxValue)) &&
      (!premiumMin || (assessment?.indicativePremium ?? 0) >= Number(premiumMin)) &&
      (!premiumMax || (assessment?.indicativePremium ?? 0) <= Number(premiumMax));
  }).sort((left, right) =>
    sort === 'value_asc' ? left.purchasePrice - right.purchasePrice :
    sort === 'value_desc' ? right.purchasePrice - left.purchasePrice :
    sort === 'category' ? left.assetType.localeCompare(right.assetType) :
    String(right.registeredAt ?? '').localeCompare(String(left.registeredAt ?? ''))
  );

  const definition = definitions[assetType];
  const section = steps[step];
  const fields = definition?.fields.filter((field) => field.section === section) ?? [];
  function close() { setOpen(false); setStep(0); setApplicationId(null); setAnswers({}); }
  function capture(form: HTMLFormElement) {
    const data = new FormData(form); const next = { ...answers };
    fields.forEach((field) => {
      const raw = data.get(field.key);
      next[field.key] = field.type === 'number' ? Number(raw) : field.type === 'boolean' ? raw === 'true' : String(raw ?? '');
    });
    setAnswers(next); return next;
  }
  async function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const nextAnswers = capture(event.currentTarget);
    if (step === 0) { setStep(1); return; }
    setBusy(true);
    try {
      let id = applicationId;
      if (!id) {
        const draft = await client.mutations.createAssetApplicationDraft({ assetType, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() });
        if (draft.errors?.length || !draft.data) throw new Error(draft.errors?.[0]?.message ?? 'Could not create application');
        id = draft.data.id; setApplicationId(id);
      }
      const saved = await client.mutations.saveAssetApplicationSection({
        applicationId: id, section, answers: nextAnswers, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
      });
      if (saved.errors?.length) throw new Error(saved.errors[0].message);
      setStep(Math.min(step + 1, steps.length - 1));
      notify('Application progress saved.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not save the application.'); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!applicationId) return; setBusy(true);
    try {
      const data = new FormData(event.currentTarget); const evidence = data.get('valuationEvidence');
      if (!(evidence instanceof File) || !evidence.size) throw new Error('A purchase invoice or valuation is required.');
      const objectKey = `quarantine/${owner}/applications/${applicationId}/${crypto.randomUUID()}-${evidence.name}`;
      const digest = await crypto.subtle.digest('SHA-256', await evidence.arrayBuffer());
      const checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      await uploadData({ path: objectKey, data: evidence, options: { contentType: evidence.type } }).result;
      const document = await client.models.ApplicationDocument.create({
        owner, applicationId, category: 'VALUATION', objectKey, fileName: evidence.name, mediaType: evidence.type,
        byteSize: evidence.size, checksum, status: 'QUARANTINED', uploadedAt: new Date().toISOString(),
      });
      if (document.errors?.length) throw new Error(document.errors[0].message);
      const result = await client.mutations.submitAssetApplication({ applicationId, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() });
      if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? 'Submission failed');
      notify(`Application ${result.data.applicationNumber} submitted. The estimate is indicative and is not active cover.`);
      close(); await refresh();
    } catch (error) { notify(error instanceof Error ? error.message : 'Submission failed.'); }
    finally { setBusy(false); }
  }
  const clear = () => { setQuery(''); setCategory(''); setStatus(''); setCover(''); setCondition(''); setMinValue(''); setMaxValue(''); setPremiumMin(''); setPremiumMax(''); setSort('newest'); };
  return <>
    <PageHeader eyebrow="Asset underwriting" title="Apply for cover, asset by asset." description="Build a rigorous asset record, declare relevant risk history, receive an indicative range and submit it for human underwriting." action={<button className="primary" onClick={() => setOpen(true)}>+ Start application</button>} />
    {open && <div className="wizard-backdrop"><form className="asset-wizard" onSubmit={step === steps.length - 1 ? submit : next}>
      <header><div><span className="eyebrow">Resumable policy application</span><h2>{titleCase(section)}</h2><p>Step {step + 1} of {steps.length}. Your answers are saved as you continue.</p></div><button type="button" className="icon-button" onClick={close}>×</button></header>
      <div className="application-progress">{steps.map((item, index) => <span className={index <= step ? 'active' : ''} key={item}>{index + 1}<small>{titleCase(item)}</small></span>)}</div>
      <div className="wizard-body">
        {step === 0 && <div className="category-grid">{categories.map(([value, label, note]) => <button type="button" className={assetType === value ? 'selected' : ''} onClick={() => setAssetType(value)} key={value}><i>◇</i><span><strong>{label}</strong><small>{note}</small></span></button>)}</div>}
        {step > 0 && step < steps.length - 1 && <div className="wizard-fields">{fields.map((field) => <DynamicField key={field.key} field={field} value={answers[field.key]} />)}</div>}
        {step === steps.length - 1 && <div className="application-review"><div><h3>Review your application</h3><p>{Object.keys(answers).length} underwriting answers captured under schema {definition?.schemaVersion}. The estimate uses declared information and platform history only.</p><dl>{Object.entries(answers).slice(0, 12).map(([key, value]) => <div key={key}><dt>{titleCase(key)}</dt><dd>{String(value)}</dd></div>)}</dl></div><Field label="Purchase invoice or current valuation" hint="PDF, JPEG or PNG. It enters quarantine and malware scanning."><input name="valuationEvidence" type="file" accept=".pdf,.jpg,.jpeg,.png" required /></Field><div className="pricing-preview"><span>Indicative only</span><strong>Submitting does not activate cover</strong><p>Underwriting reviews the evidence, issues a formal quote, and cover starts only after you accept it.</p></div></div>}
      </div>
      <footer><button type="button" className="secondary" onClick={() => step === 0 ? close() : setStep(step - 1)}>← Back</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : step === steps.length - 1 ? 'Submit for underwriting' : 'Save & continue →'}</button></footer>
    </form></div>}
    <section className="asset-filters panel">
      <label className="search">⌕ <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search descriptions, VIN, serial, registration, address or application…" /></label>
      <div className="filter-grid"><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All application states</option>{['UNDER_REVIEW', 'INSURABLE', 'DECLINED', 'ARCHIVED'].map((value) => <option key={value}>{value}</option>)}</select><select value={cover} onChange={(event) => setCover(event.target.value)}><option value="">Any cover state</option><option value="COVERED">Covered</option><option value="UNCOVERED">Not covered</option></select><select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="">Any condition</option><option>excellent</option><option>average</option><option>poor</option></select><input value={minValue} onChange={(event) => setMinValue(event.target.value)} type="number" placeholder="Minimum value" /><input value={maxValue} onChange={(event) => setMaxValue(event.target.value)} type="number" placeholder="Maximum value" /><input value={premiumMin} onChange={(event) => setPremiumMin(event.target.value)} type="number" placeholder="Minimum premium" /><input value={premiumMax} onChange={(event) => setPremiumMax(event.target.value)} type="number" placeholder="Maximum premium" /><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="value_desc">Highest value</option><option value="value_asc">Lowest value</option><option value="category">Category</option></select><button className="text-button" onClick={clear}>Clear all</button></div>
      <div className="filter-summary"><strong>{filtered.length} results</strong>{[query, category, status, cover, condition].filter(Boolean).map((value) => <span key={value}>{value}</span>)}</div>
    </section>
    {filtered.length ? <div className="asset-grid">{filtered.map((asset) => {
      const application = applications.find((item) => item.assetId === asset.id);
      const estimate = premiumAssessments.find((item) => item.id === application?.latestAssessmentId);
      return <article className="asset-card" key={asset.id}><div className={`asset-visual ${asset.assetType}`}><span>◇</span><Status value={asset.policyId ? 'COVERED' : application?.status ?? asset.status ?? 'UNDER_REVIEW'} /></div><div className="asset-body"><span className="eyebrow">{titleCase(asset.assetType)} · {application?.applicationNumber ?? 'Legacy asset'}</span><h3>{asset.description || 'Unnamed asset'}</h3><p>{[asset.make, asset.model, asset.year].filter(Boolean).join(' ') || titleCase(asset.condition)}</p><div className="asset-facts"><span><small>Declared value</small><strong>{money.format(asset.purchasePrice)}</strong></span><span><small>Indicative monthly</small><strong>{estimate ? `${money.format(estimate.rangeLow)}–${money.format(estimate.rangeHigh)}` : 'Awaiting assessment'}</strong></span><span><small>Registered</small><strong>{shortDate(asset.registeredAt ?? asset.purchaseDate)}</strong></span></div><div className="asset-footer"><span className={asset.policyId ? 'cover active' : 'cover'}>{asset.policyId ? '● Policy active' : '○ Not active cover'}</span><button className="text-button">Application details →</button></div></div></article>;
    })}</div> : <EmptyState title="No matching assets" copy="Clear one or more filters, or begin a detailed application for a new asset." />}
  </>;
}

function DynamicField({ field, value }: { field: DefinitionField; value: unknown }) {
  const required = Boolean(field.required);
  if (field.type === 'select') return <Field label={field.label}><select name={field.key} defaultValue={String(value ?? '')} required={required}><option value="">Select…</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select></Field>;
  if (field.type === 'boolean') return <Field label={field.label}><select name={field.key} defaultValue={value === true ? 'true' : value === false ? 'false' : ''} required={required}><option value="">Select…</option><option value="false">No</option><option value="true">Yes</option></select></Field>;
  return <Field label={field.label}><input name={field.key} type={field.type} defaultValue={String(value ?? '')} min={field.type === 'number' ? 0 : undefined} required={required} /></Field>;
}
