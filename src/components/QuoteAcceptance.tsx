import { FormEvent, useState } from 'react';
import { COOLING_OFF, WORDING_SUMMARY, hasPlaceholders } from '../lib/company';
import { money } from '../lib/format';
import { useModal } from '../lib/useModal';
import type { PolicyApplication } from '../types';

/**
 * Accepting a quote activates cover, so the client sees exactly what they are agreeing to first: the price,
 * what they pay first on a claim, the most the policy pays, what is excluded and their cooling-off rights.
 */
export function QuoteAcceptance({ application, assetName, onCancel, onAccept }: {
  application: PolicyApplication; assetName: string; onCancel: () => void; onAccept: (wordingVersion: string) => Promise<void>;
}) {
  const modal = useModal<HTMLFormElement>(onCancel, 'Review and accept your quote');
  const [terms, setTerms] = useState(false);
  const [truth, setTruth] = useState(false);
  const [busy, setBusy] = useState(false);
  const quote = application.quoteTerms;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!quote) return;
    setBusy(true);
    try { await onAccept(quote.wordingVersion); } finally { setBusy(false); }
  }
  return <div className="wizard-backdrop confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <form className="confirm-modal quote-modal" {...modal} onSubmit={submit}>
      <span className="eyebrow">{application.applicationNumber}</span>
      <h2>Review your quote for {assetName}</h2>
      {!quote ? <p className="form-error" role="alert">This quote was issued before the policy terms were recorded. Please ask underwriting to issue it again.</p> : <>
        <dl className="confirm-facts">
          <div><dt>Monthly premium</dt><dd><strong>{money.format(application.quotedPremium ?? 0)}</strong></dd></div>
          <div><dt>Excess<small>You pay this first on any claim</small></dt><dd>{money.format(quote.excess)}</dd></div>
          <div><dt>Cover limit<small>The most the policy pays for this asset</small></dt><dd>{money.format(quote.coverLimit)}</dd></div>
          <div><dt>Policy period</dt><dd>12 months from acceptance</dd></div>
          <div><dt>Wording version</dt><dd>{quote.wordingVersion}</dd></div>
        </dl>
        <h3>Not covered</h3>
        {quote.exclusions.length ? <ul className="exclusions">{quote.exclusions.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">No specific exclusions were recorded on this quote.</p>}
        <h3>Your policy wording</h3><p className="muted">{WORDING_SUMMARY}</p>
        <h3>Your cooling-off rights</h3><p className="muted">{COOLING_OFF}</p>
        <p className="info-callout small"><strong>Payment:</strong> accepting activates your cover. Debit-order set-up is the next step and is not available in this release, so no payment is taken now.</p>
        {hasPlaceholders() && <p className="form-error" role="note">Some legal wording above is still awaiting compliance review.</p>}
        <label className="check"><input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} /> I have read the cover limit, excess and exclusions above.</label>
        <label className="check"><input type="checkbox" checked={truth} onChange={(event) => setTruth(event.target.checked)} /> The answers I gave in my application are true and complete.</label>
      </>}
      <div className="form-actions"><button type="button" className="secondary" onClick={onCancel} disabled={busy}>Not now</button><button className="primary" disabled={!quote || !terms || !truth || busy}>{busy ? 'Activating…' : `Accept ${money.format(application.quotedPremium ?? 0)}/month and activate`}</button></div>
    </form>
  </div>;
}
