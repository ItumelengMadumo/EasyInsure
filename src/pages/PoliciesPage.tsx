import { FormEvent, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import { QuoteAcceptance } from '../components/QuoteAcceptance';
import { EmptyState, Field, PageHeader, Status } from '../components/ui';
import { client } from '../lib/data';
import { money, shortDate, titleCase } from '../lib/format';
import { clientName } from '../lib/portfolio';
import { roleFlags } from '../lib/roles';
import { openSchedule } from '../lib/schedule';
import type { Portfolio, PolicyApplication } from '../types';

type Props = { portfolio: Portfolio; groups: string[]; owner: string; refresh: () => Promise<void>; notify: (message: string) => void };
const keys = () => ({ idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() });
const lines = (text: string) => text.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

export function PoliciesPage({ portfolio, groups, refresh, notify }: Props) {
  const access = roleFlags(groups);
  const senior = access.isSenior;
  const [accepting, setAccepting] = useState<PolicyApplication | null>(null);
  const [declining, setDeclining] = useState<PolicyApplication | null>(null);
  const assetFor = (application: PolicyApplication) => portfolio.assets.find((item) => item.id === application.assetId);
  const open = portfolio.applications.filter((item) => item.status !== 'ACCEPTED');
  const history = portfolio.applications.filter((item) => item.status === 'ACCEPTED');

  async function review(application: PolicyApplication, decision: string, reason?: string) {
    const result = await client.mutations.reviewPolicyApplication({ applicationId: application.id, decision, reason, ...keys() });
    if (result.errors?.length) { notify(result.errors[0].message); return; }
    setDeclining(null); notify(decision === 'DECLINED' ? 'Application declined and the reason recorded.' : 'Underwriting review started.'); await refresh();
  }
  async function quote(event: FormEvent<HTMLFormElement>, application: PolicyApplication) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const result = await client.mutations.issuePolicyQuote({
      applicationId: application.id, monthlyPremium: Number(form.get('monthlyPremium')),
      excess: Number(form.get('excess')), coverLimit: Number(form.get('coverLimit')), exclusions: lines(String(form.get('exclusions') ?? '')),
      overrideReason: String(form.get('overrideReason') ?? ''), ...keys(),
    });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Formal quote issued to the client.'); await refresh(); }
  }
  async function accept(application: PolicyApplication, wordingVersion: string) {
    const result = await client.mutations.acceptPolicyQuote({ applicationId: application.id, acceptedWordingVersion: wordingVersion, ...keys() });
    if (result.errors?.length) { notify(result.errors[0].message); return; }
    setAccepting(null); notify('Quote accepted. Your policy is now active. You can download the policy schedule below.'); await refresh();
  }

  const card = (application: PolicyApplication) => {
    const assessment = portfolio.premiumAssessments.find((item) => item.id === application.latestAssessmentId);
    const asset = assetFor(application);
    const terms = application.quoteTerms;
    return <article className="panel application-card" key={application.id}>
      <div><span className="eyebrow">{application.applicationNumber ?? 'Draft application'}{senior ? ` · ${clientName(portfolio, application.owner)}` : ''}</span><h2>{asset?.description ?? titleCase(application.assetType)}</h2><Status value={application.status} /></div>
      <p>{assessment ? `Indicative range ${money.format(assessment.rangeLow)}–${money.format(assessment.rangeHigh)} per month. This is an estimate, not active cover.` : 'The indicative assessment is still pending.'}</p>
      {!!assessment?.factors?.length && <details className="why-price"><summary>Why this price?</summary><ul>{assessment.factors.map((factor) => <li key={factor.name}><strong>{factor.name}</strong><small>{factor.reason}</small></li>)}</ul></details>}
      {application.missingInformation.length > 0 && <small>Missing: {application.missingInformation.join(', ')}</small>}
      {application.status === 'QUOTED' && terms && <dl className="quote-terms"><div><dt>Quoted premium</dt><dd><strong>{money.format(application.quotedPremium ?? 0)}</strong> a month</dd></div><div><dt>Excess</dt><dd>{money.format(terms.excess)}</dd></div><div><dt>Cover limit</dt><dd>{money.format(terms.coverLimit)}</dd></div><div><dt>Valid until</dt><dd>{shortDate(application.quoteExpiresAt)}</dd></div></dl>}
      <div className="application-actions">
        {senior && ['SUBMITTED', 'MORE_INFO_REQUIRED'].includes(application.status) && <><button className="secondary" onClick={() => review(application, 'UNDER_REVIEW')}>Begin review</button><button className="reject-button" onClick={() => setDeclining(application)}>Decline</button></>}
        {senior && application.status === 'UNDER_REVIEW' && <form onSubmit={(event) => quote(event, application)}>
          <Field label="Monthly premium (ZAR)" hint={assessment ? `Indicative: ${money.format(assessment.indicativePremium)}. More than 10% away needs a reason.` : 'What the client pays each month.'}><input name="monthlyPremium" type="number" min="1" step=".01" defaultValue={assessment?.indicativePremium} required /></Field>
          <Field label="Excess (ZAR)" hint="What the client pays first on any claim."><input name="excess" type="number" min="0" placeholder="e.g. 5000" required /></Field>
          <Field label="Cover limit (ZAR)" hint="The most the policy pays for this asset."><input name="coverLimit" type="number" min="1" defaultValue={asset?.purchasePrice} required /></Field>
          <Field label="Exclusions (optional)" hint="One per line, or separated by commas. These are shown to the client before they accept." className="wide"><textarea name="exclusions" rows={2} placeholder="e.g. Wear and tear, Unlicensed drivers" /></Field>
          <Field label="Reason for departing from the estimate" hint="Required only if the premium is more than 10% above or below the estimate." className="wide"><input name="overrideReason" placeholder="e.g. Alarm and tracker fitted, lower theft risk" /></Field>
          <button className="primary">Issue formal quote</button></form>}
        {!senior && application.status === 'QUOTED' && <button className="primary" onClick={() => setAccepting(application)}>Review terms and accept</button>}
      </div>
    </article>;
  };

  return <>
    <PageHeader eyebrow={senior ? 'Underwriting' : 'Cover management'} title={senior ? 'Review, quote and activate.' : 'Applications before policies.'} description="Indicative estimates are reviewed, formally quoted and accepted before an active policy is created." />
    <div className="policy-summary"><div><small>Open applications</small><strong>{open.length}</strong></div><div><small>Active policies</small><strong>{portfolio.policies.filter((item) => item.status === 'ACTIVE').length}</strong></div><div><small>Approved monthly premiums</small><strong>{money.format(portfolio.policies.reduce((sum, item) => sum + (item.approvedPremium ?? 0), 0))}</strong></div></div>
    {open.length > 0 && <section className="application-list">{open.map(card)}</section>}
    {history.length > 0 && <details className="panel history-panel"><summary>Accepted applications ({history.length})</summary><ul>{history.map((application) => <li key={application.id}><strong>{application.applicationNumber}</strong><span>{assetFor(application)?.description ?? titleCase(application.assetType)}{senior ? ` · ${clientName(portfolio, application.owner)}` : ''}</span><small>Accepted {shortDate(application.acceptedAt)} · {money.format(application.quotedPremium ?? 0)}/month</small></li>)}</ul></details>}
    {portfolio.policies.length ? <div className="policy-list">{portfolio.policies.map((policy) => {
      const linked = portfolio.assets.filter((asset) => asset.policyId === policy.id);
      const claims = portfolio.claims.filter((claim) => claim.policyId === policy.id);
      const holder = clientName(portfolio, policy.owner ?? portfolio.profile?.owner);
      return <article className="policy-card" key={policy.id}><div className="policy-accent" /><div className="policy-main"><div className="policy-top"><div><span className="eyebrow">{policy.policyNumber}{senior ? ` · ${holder}` : ''}</span><h2>{titleCase(policy.valuationType)} cover</h2></div><Status value={policy.status} /></div><p>{policy.coverageDetails || 'Comprehensive asset protection with auditable valuation.'}</p>
        <div className="policy-facts"><span><small>Starts</small><strong>{shortDate(policy.startDate)}</strong></span><span><small>Ends</small><strong>{shortDate(policy.endDate)}</strong></span><span><small>Approved premium</small><strong>{policy.approvedPremium ? `${money.format(policy.approvedPremium)}/month` : 'Awaiting approval'}</strong></span><span><small>Cover limit</small><strong>{policy.coverLimit ? money.format(policy.coverLimit) : '—'}</strong></span><span><small>Excess</small><strong>{policy.excess != null ? money.format(policy.excess) : '—'}</strong></span><span><small>Duration</small><strong>{policy.durationMonths} months</strong></span></div>
        {!!policy.exclusions?.length && <div className="linked-assets"><small>Not covered</small><div>{policy.exclusions.map((item) => <span key={item}>{item}</span>)}</div></div>}
        <div className="linked-assets"><small>Linked assets</small><div>{linked.map((asset) => <span key={asset.id}>{asset.description || titleCase(asset.assetType)}</span>)}</div></div>
        <div className="linked-assets"><small>Claims on this policy</small><div>{claims.length ? claims.map((claim) => <span key={claim.id}>{claim.claimNumber} · {titleCase(claim.status)}</span>) : <span>No claims</span>}</div></div>
        <div className="application-actions"><button className="secondary" onClick={() => { if (!openSchedule(policy, linked[0], holder, claims)) notify('Your browser blocked the schedule window. Allow pop-ups for this site and try again.'); }}>View policy schedule</button></div>
      </div></article>;
    })}</div> : <EmptyState title="No active policies" copy="A policy appears only after underwriting issues a formal quote and the client accepts it." />}
    {accepting && <QuoteAcceptance application={accepting} assetName={assetFor(accepting)?.description ?? titleCase(accepting.assetType)} onCancel={() => setAccepting(null)} onAccept={(version) => accept(accepting, version)} />}
    {declining && <ConfirmModal title="Decline this application?" description="The asset and application are marked declined. The reason stays on the audit trail." tone="danger" confirmLabel="Decline application" fields={[{ name: 'reason', label: 'Why is it being declined?', hint: 'At least 5 characters.', type: 'textarea', required: true, minLength: 5, placeholder: 'e.g. The valuation document does not match the declared value.' }]} onCancel={() => setDeclining(null)} onConfirm={(values) => review(declining, 'DECLINED', values.reason)} />}
  </>;
}
