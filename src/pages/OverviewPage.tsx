import { ClaimTable, Metric, PageHeader } from '../components/ui';
import { money } from '../lib/format';
import type { Page, Portfolio } from '../types';

export function OverviewPage({ portfolio, go, displayName }: { portfolio: Portfolio; go: (page: Page) => void; displayName: string }) {
  const pending = portfolio.claims.filter((claim) => !['CLOSED', 'PAID', 'REJECTED'].includes(claim.status)).length;
  const activePolicies = portfolio.policies.filter((policy) => policy.status.toLowerCase() === 'active').length;
  const protectedValue = portfolio.assets.reduce((sum, asset) => sum + asset.purchasePrice, 0);
  const flagged = portfolio.claims.filter((claim) => claim.fraudFlag).length;
  const firstName = displayName.split(/[\s@]/)[0];
  return <>
    <PageHeader eyebrow="Operations overview" title={`Good day, ${firstName}.`} description="Your cover, claims and operational decisions in one explainable workspace." action={<button className="primary" onClick={() => go('claims')}>＋ Start a claim</button>} />
    <section className="metrics">
      <Metric value={money.format(protectedValue)} label="Protected asset value" detail={`${portfolio.assets.length} registered assets`} />
      <Metric value={activePolicies} label="Active policies" detail={`${portfolio.policies.length} total policies`} />
      <Metric value={pending} label="Claims in progress" detail="Across review stages" tone="amber" />
      <Metric value={flagged} label="Needs attention" detail="Rule-based indicators" tone={flagged ? 'red' : 'green'} />
    </section>
    <section className="dashboard-grid">
      <article className="panel wide">
        <div className="panel-title"><div><span className="eyebrow">Live portfolio</span><h2>Recent claims</h2></div><button className="secondary" onClick={() => go('claims')}>View all claims</button></div>
        <ClaimTable claims={portfolio.claims.slice(0, 5)} onSelect={() => go('claims')} />
      </article>
      <article className="panel">
        <span className="eyebrow">Protection health</span><h2>Portfolio snapshot</h2>
        <div className="donut"><div><strong>{portfolio.assets.length ? Math.round((portfolio.assets.filter((item) => item.policyId).length / portfolio.assets.length) * 100) : 0}%</strong><span>covered</span></div></div>
        <div className="legend"><span><i className="green-dot" />Linked to policy <strong>{portfolio.assets.filter((item) => item.policyId).length}</strong></span><span><i className="grey-dot" />Needs cover <strong>{portfolio.assets.filter((item) => !item.policyId).length}</strong></span></div>
        <button className="secondary full" onClick={() => go('assets')}>Review assets</button>
      </article>
    </section>
    <section className="principle-strip"><div><span>01</span><strong>Deterministic pricing</strong><p>Fixed formulas create repeatable, auditable outcomes.</p></div><div><span>02</span><strong>Explainable assistance</strong><p>Every factor and flag includes a reason.</p></div><div><span>03</span><strong>Human sign-off</strong><p>No payout is approved by AI.</p></div></section>
  </>;
}
