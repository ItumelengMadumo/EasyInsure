import { FormEvent, useState } from 'react';
import { Field, PageHeader } from '../components/ui';
import { client } from '../lib/data';
import { money } from '../lib/format';

export function EstimatorPage() {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [excess, setExcess] = useState(5000);
  const [busy, setBusy] = useState(false);
  async function estimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget);
    const response = await client.queries.runInsuranceEngine({ operation: 'calculatePremium', payload: { assetType: String(form.get('assetType')), assetValue: Number(form.get('assetValue')), previousClaimsCount: Number(form.get('claims')), excess } });
    setResult((response.data as Record<string, unknown>) ?? null); setBusy(false);
  }
  const rawPremium = Number(result?.suggestedPremium ?? result?.premium ?? 0);
  return <>
    <PageHeader eyebrow="Planning tool" title="Price the protection." description="A transparent ballpark estimate using the same deterministic principles as our policy engine." />
    <div className="estimator-layout"><form className="panel estimator-form" onSubmit={estimate}><h2>Cover assumptions</h2><p>Adjust the inputs to explore your indicative premium.</p><Field label="Asset category"><select name="assetType"><option value="vehicle">Vehicle</option><option value="property">Property</option><option value="electronics">Electronics</option><option value="machinery">Machinery</option></select></Field><Field label="Replacement value (ZAR)"><input name="assetValue" type="number" min="1000" defaultValue="350000" required /></Field><Field label="Claims in the last 3 years"><select name="claims"><option value="0">None</option><option value="1">1 claim</option><option value="2">2 claims</option><option value="3">3 or more</option></select></Field><Field label={`Selected excess · ${money.format(excess)}`} hint="A higher excess generally lowers the premium."><input type="range" min="1000" max="25000" step="1000" value={excess} onChange={(event) => setExcess(Number(event.target.value))} /></Field><button className="primary full" disabled={busy}>{busy ? 'Calculating…' : 'Calculate estimate'}</button></form><section className="estimate-result"><span className="eyebrow">Indicative cover</span><h2>{result ? money.format(rawPremium) : 'Your estimate'}</h2><p>{result ? 'Estimated monthly premium before human underwriting review.' : 'Complete the assumptions to see a transparent ballpark premium.'}</p><div className="estimate-breakdown"><span><small>Selected excess</small><strong>{money.format(excess)}</strong></span><span><small>Decision method</small><strong>Deterministic</strong></span><span><small>Currency</small><strong>ZAR</strong></span></div><div className="formula-note"><strong>No black-box pricing</strong><p>Risk factors are fixed, versioned and auditable. This estimate is not a quote or active cover.</p></div></section></div>
  </>;
}
