import { EmptyState, PageHeader, Status } from '../components/ui';
import { money, shortDate, titleCase } from '../lib/format';
import type { Portfolio } from '../types';

export function PoliciesPage({ portfolio }: { portfolio: Portfolio }) {
  return <>
    <PageHeader eyebrow="Cover management" title="Policies, made legible." description="See cover, valuation basis, premiums and linked assets without hunting through documents." />
    <div className="policy-summary"><div><small>Policies</small><strong>{portfolio.policies.length}</strong></div><div><small>Approved monthly premiums</small><strong>{money.format(portfolio.policies.reduce((sum, item) => sum + (item.approvedPremium ?? 0), 0))}</strong></div><div><small>Assets linked</small><strong>{portfolio.assets.filter((item) => item.policyId).length}</strong></div></div>
    {portfolio.policies.length ? <div className="policy-list">{portfolio.policies.map((policy) => {
      const linked = portfolio.assets.filter((asset) => asset.policyId === policy.id);
      return <article className="policy-card" key={policy.id}><div className="policy-accent" /><div className="policy-main"><div className="policy-top"><div><span className="eyebrow">{policy.policyNumber}</span><h2>{titleCase(policy.valuationType)} cover</h2></div><Status value={policy.status} /></div><p>{policy.coverageDetails || 'Comprehensive asset protection with auditable valuation.'}</p><div className="policy-facts"><span><small>Starts</small><strong>{shortDate(policy.startDate)}</strong></span><span><small>Ends</small><strong>{shortDate(policy.endDate)}</strong></span><span><small>Duration</small><strong>{policy.durationMonths} months</strong></span><span><small>Approved premium</small><strong>{policy.approvedPremium ? money.format(policy.approvedPremium) : 'Awaiting approval'}</strong></span></div><div className="linked-assets"><small>Linked assets</small><div>{linked.length ? linked.map((asset) => <span key={asset.id}>{asset.description || titleCase(asset.assetType)}</span>) : <em>No assets linked</em>}</div></div></div><button className="text-button">View policy →</button></article>;
    })}</div> : <EmptyState title="No policies available" copy="Approved policies and their linked assets will appear here." />}
  </>;
}
