import { money, shortDate, titleCase } from '../lib/format';
import { COVER_STATES, type CoverState } from '../lib/status';
import { useModal } from '../lib/useModal';
import type { Asset, Policy, PolicyApplication, PremiumAssessment } from '../types';
import { Status } from './ui';

const STEPS: [string, string][] = [['SUBMITTED', 'Submitted'], ['UNDER_REVIEW', 'In underwriting'], ['QUOTED', 'Quote issued'], ['ACCEPTED', 'Accepted']];

/** Everything about one asset's application: where it stands, what was declared, and why it is priced as it is. */
export function ApplicationDetails({ asset, application, assessment, policy, state, labelFor, onClose }: {
  asset: Asset; application?: PolicyApplication; assessment?: PremiumAssessment; policy?: Policy; state: CoverState;
  labelFor: (key: string) => string; onClose: () => void;
}) {
  const modal = useModal(onClose, `Details for ${asset.description ?? 'asset'}`);
  const position = STEPS.findIndex(([status]) => status === application?.status);
  const answers = Object.entries(application?.answers ?? {}).filter(([, value]) => value !== '' && value !== null && value !== undefined);
  const terms = application?.quoteTerms;
  return <div className="wizard-backdrop preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="preview-modal details-modal" {...modal}>
      <header>
        <div><span className="eyebrow">{titleCase(asset.assetType)} · {application?.applicationNumber ?? 'Legacy asset'}</span><h2>{asset.description || 'Unnamed asset'}</h2>
          <p>{COVER_STATES.find((item) => item.value === state)?.label} · declared value {money.format(asset.purchasePrice)}</p></div>
        <button className="icon-button" onClick={onClose} aria-label="Close details">×</button>
      </header>
      <div className="details-body">
        {application && <ol className="app-steps" aria-label="Application progress">{STEPS.map(([status, label], index) => <li key={status} className={position >= index ? 'done' : ''}><b>{position > index ? '✓' : index + 1}</b>{label}</li>)}{application.status === 'DECLINED' && <li className="declined"><b>!</b>Declined</li>}</ol>}
        {application?.status === 'QUOTED' && terms && <section><h3>Your quote</h3><dl className="quote-terms"><div><dt>Premium</dt><dd><strong>{money.format(application.quotedPremium ?? 0)}</strong> a month</dd></div><div><dt>Excess</dt><dd>{money.format(terms.excess)}</dd></div><div><dt>Cover limit</dt><dd>{money.format(terms.coverLimit)}</dd></div><div><dt>Valid until</dt><dd>{shortDate(application.quoteExpiresAt)}</dd></div></dl></section>}
        {policy && <section><h3>Policy</h3><dl className="quote-terms"><div><dt>Number</dt><dd>{policy.policyNumber}</dd></div><div><dt>Status</dt><dd><Status value={policy.status} /></dd></div><div><dt>Premium</dt><dd>{policy.approvedPremium ? `${money.format(policy.approvedPremium)} a month` : '—'}</dd></div><div><dt>Runs</dt><dd>{shortDate(policy.startDate)} to {shortDate(policy.endDate)}</dd></div></dl></section>}
        {assessment && <section><h3>Why this price</h3>
          <p className="muted">Indicative {money.format(assessment.rangeLow)}–{money.format(assessment.rangeHigh)} a month, from fixed formulas. Every factor has a reason.</p>
          <ul className="signal-list">{(assessment.factors ?? []).map((factor) => <li key={factor.name}><b>{factor.factor > 0 ? '+' : factor.factor < 0 ? '−' : '·'}</b><span><strong>{factor.name}</strong><small>{factor.reason}</small></span></li>)}</ul>
          {!!assessment.assumptions?.length && <small className="muted">{assessment.assumptions.join(' · ')}</small>}</section>}
        {answers.length > 0 && <section><h3>What you declared</h3><dl className="answers">{answers.map(([key, value]) => <div key={key}><dt>{labelFor(key)}</dt><dd>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</dd></div>)}</dl></section>}
        {!application && <p className="muted">This asset was registered before applications were tracked, so there is no application history to show.</p>}
      </div>
      <footer><button className="primary" onClick={onClose}>Close</button></footer>
    </section>
  </div>;
}
