import { FormEvent } from 'react';
import { EmptyState, PageHeader, Status } from '../components/ui';
import { client } from '../lib/data';
import { money, shortDate, titleCase } from '../lib/format';
import type { Portfolio, PolicyApplication } from '../types';

type Props = { portfolio: Portfolio; groups: string[]; refresh: () => Promise<void>; notify: (message: string) => void };
export function PoliciesPage({ portfolio, groups, refresh, notify }: Props) {
  const senior = groups.some((group) => ['senior_officer', 'superuser'].includes(group));
  async function review(application: PolicyApplication, decision: string) {
    const reason = decision === 'DECLINED' ? window.prompt('Record the decline reason') : undefined;
    if (decision === 'DECLINED' && !reason) return;
    const result = await client.mutations.reviewPolicyApplication({ applicationId: application.id, decision, reason, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Underwriting review updated.'); await refresh(); }
  }
  async function quote(event: FormEvent<HTMLFormElement>, application: PolicyApplication) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const result = await client.mutations.issuePolicyQuote({
      applicationId: application.id, monthlyPremium: Number(form.get('monthlyPremium')),
      overrideReason: String(form.get('overrideReason') ?? ''), idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Formal quote issued to the client.'); await refresh(); }
  }
  async function accept(application: PolicyApplication) {
    const result = await client.mutations.acceptPolicyQuote({ applicationId: application.id, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Quote accepted. The policy is now active.'); await refresh(); }
  }
  return <>
    <PageHeader eyebrow="Cover management" title="Applications before policies." description="Indicative estimates are reviewed, formally quoted and accepted before an active policy is created." />
    <div className="policy-summary"><div><small>Applications</small><strong>{portfolio.applications.length}</strong></div><div><small>Active policies</small><strong>{portfolio.policies.filter((item) => item.status === 'ACTIVE').length}</strong></div><div><small>Approved monthly premiums</small><strong>{money.format(portfolio.policies.reduce((sum, item) => sum + (item.approvedPremium ?? 0), 0))}</strong></div></div>
    <section className="application-list">{portfolio.applications.map((application) => {
      const assessment = portfolio.premiumAssessments.find((item) => item.id === application.latestAssessmentId);
      const asset = portfolio.assets.find((item) => item.id === application.assetId);
      return <article className="panel application-card" key={application.id}><div><span className="eyebrow">{application.applicationNumber ?? 'Draft application'}</span><h2>{asset?.description ?? titleCase(application.assetType)}</h2><Status value={application.status} /></div><p>{assessment ? `Indicative range ${money.format(assessment.rangeLow)}–${money.format(assessment.rangeHigh)} per month. This is not active cover.` : 'The indicative assessment is still pending.'}</p>{application.missingInformation.length > 0 && <small>Missing: {application.missingInformation.join(', ')}</small>}<div className="application-actions">{senior && ['SUBMITTED', 'MORE_INFO_REQUIRED'].includes(application.status) && <><button className="secondary" onClick={() => review(application, 'UNDER_REVIEW')}>Begin review</button><button className="reject-button" onClick={() => review(application, 'DECLINED')}>Decline</button></>}{senior && application.status === 'UNDER_REVIEW' && <form onSubmit={(event) => quote(event, application)}><input name="monthlyPremium" type="number" min="1" step=".01" defaultValue={assessment?.indicativePremium} required /><input name="overrideReason" placeholder="Override reason when outside ±10%" /><button className="primary">Issue formal quote</button></form>}{!senior && application.status === 'QUOTED' && <button className="primary" onClick={() => accept(application)}>Accept {money.format(application.quotedPremium ?? 0)}/month and activate</button>}</div></article>;
    })}</section>
    {portfolio.policies.length ? <div className="policy-list">{portfolio.policies.map((policy) => {
      const linked = portfolio.assets.filter((asset) => asset.policyId === policy.id);
      return <article className="policy-card" key={policy.id}><div className="policy-accent" /><div className="policy-main"><div className="policy-top"><div><span className="eyebrow">{policy.policyNumber}</span><h2>{titleCase(policy.valuationType)} cover</h2></div><Status value={policy.status} /></div><p>{policy.coverageDetails || 'Comprehensive asset protection with auditable valuation.'}</p><div className="policy-facts"><span><small>Starts</small><strong>{shortDate(policy.startDate)}</strong></span><span><small>Ends</small><strong>{shortDate(policy.endDate)}</strong></span><span><small>Duration</small><strong>{policy.durationMonths} months</strong></span><span><small>Approved premium</small><strong>{policy.approvedPremium ? money.format(policy.approvedPremium) : 'Awaiting approval'}</strong></span></div><div className="linked-assets"><small>Linked assets</small><div>{linked.map((asset) => <span key={asset.id}>{asset.description || titleCase(asset.assetType)}</span>)}</div></div></div></article>;
    })}</div> : <EmptyState title="No active policies" copy="A policy appears only after underwriting issues a formal quote and the client accepts it." />}
  </>;
}
