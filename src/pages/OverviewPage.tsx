import { ClaimTable, EmptyState, Metric, PageHeader } from '../components/ui';
import { clientName } from '../lib/portfolio';
import { dateTime, money, titleCase } from '../lib/format';
import type { Access } from '../lib/roles';
import { clientStatus } from '../lib/status';
import { buildWorkQueue } from '../lib/workQueue';
import type { Page, Portfolio } from '../types';
import { DiagnosticsPage } from './DiagnosticsPage';

type Props = { portfolio: Portfolio; go: (page: Page) => void; displayName: string; access: Access; owner: string };

export function OverviewPage(props: Props) {
  if (props.access.isDeveloper) return <DiagnosticsPage portfolio={props.portfolio} />;
  return props.access.isStaff ? <StaffOverview {...props} /> : <ClientOverview {...props} />;
}

function ClientOverview({ portfolio, go, displayName, access }: Props) {
  const firstName = displayName.split(/[\s@]/)[0];
  const covered = portfolio.assets.filter((asset) => asset.policyId);
  const activePolicies = portfolio.policies.filter((policy) => policy.status.toLowerCase() === 'active').length;
  const inProgress = portfolio.claims.filter((claim) => !['CLOSED', 'PAID', 'REJECTED', 'DRAFT', 'INFO_NEEDED'].includes(claim.status)).length;
  const replies = portfolio.claims.filter((claim) => claim.status === 'INFO_NEEDED');
  const quotes = portfolio.applications.filter((application) => application.status === 'QUOTED');
  const waiting = replies.length + quotes.length;
  return <>
    <PageHeader eyebrow="Your cover at a glance" title={`Good day, ${firstName}.`} description="Your cover, claims and any decisions that need you, in one explainable place." action={<button className="primary" onClick={() => go('claims')}>＋ Start a claim</button>} />
    <section className="metrics">
      <Metric value={money.format(covered.reduce((sum, asset) => sum + asset.purchasePrice, 0))} label="Protected value" detail={`${covered.length} of ${portfolio.assets.length} registered assets covered`} />
      <Metric value={activePolicies} label="Active policies" detail={`${portfolio.policies.length} total policies`} />
      <Metric value={inProgress} label="Claims in progress" detail="Being checked or assessed" tone="amber" />
      <Metric value={waiting} label="Waiting on you" detail={waiting ? 'Open the items below' : 'Nothing needs your attention'} tone={waiting ? 'red' : 'green'} />
    </section>
    {waiting > 0 && <section className="panel waiting-panel"><div className="panel-title"><div><span className="eyebrow">Needs you</span><h2>Waiting on you</h2></div></div>
      <ul className="waiting-list">
        {replies.map((claim) => <li key={claim.id}><div><strong>Reply needed on {claim.claimNumber}</strong><small>{clientStatus(claim.status).next}</small></div><button className="primary" onClick={() => go('claims')}>Reply now →</button></li>)}
        {quotes.map((application) => <li key={application.id}><div><strong>Your quote is ready: {portfolio.assets.find((asset) => asset.id === application.assetId)?.description ?? titleCase(application.assetType)}</strong><small>{money.format(application.quotedPremium ?? 0)} a month. Review the terms and accept to activate cover.</small></div><button className="primary" onClick={() => go('policies')}>Review quote →</button></li>)}
      </ul></section>}
    <section className="dashboard-grid">
      <article className="panel wide">
        <div className="panel-title"><div><span className="eyebrow">Your claims</span><h2>Recent claims</h2></div><button className="secondary" onClick={() => go('claims')}>View all claims</button></div>
        {portfolio.claims.length ? <ClaimTable claims={portfolio.claims.slice(0, 5)} onSelect={() => go('claims')} access={access} portfolio={portfolio} /> : <EmptyState title="No claims yet" copy="If something goes wrong with an insured asset, start a claim and we will guide you through it." />}
      </article>
      <article className="panel">
        <span className="eyebrow">Protection health</span><h2>Portfolio snapshot</h2>
        <div className="donut"><div><strong>{portfolio.assets.length ? Math.round((covered.length / portfolio.assets.length) * 100) : 0}%</strong><span>covered</span></div></div>
        <div className="legend"><span><i className="green-dot" />Linked to policy <strong>{covered.length}</strong></span><span><i className="grey-dot" />Needs cover <strong>{portfolio.assets.length - covered.length}</strong></span></div>
        <button className="secondary full" onClick={() => go('assets')}>Review assets</button>
      </article>
    </section>
    <section className="principle-strip"><div><span>01</span><strong>Deterministic pricing</strong><p>Fixed formulas create repeatable, auditable outcomes.</p></div><div><span>02</span><strong>Explainable assistance</strong><p>Every factor and flag includes a reason.</p></div><div><span>03</span><strong>Human sign-off</strong><p>No payout is approved by AI.</p></div></section>
  </>;
}

function StaffOverview({ portfolio, go, displayName, access, owner }: Props) {
  const firstName = displayName.split(/[\s@]/)[0];
  const queue = buildWorkQueue(portfolio, access, owner);
  const statuses = Object.entries(queue.byStatus).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...statuses.map(([, count]) => count));
  const description = access.isSenior
    ? 'Everything that needs a senior officer: reviews, decisions, quotes and the cases that are running late.'
    : 'The cases you are assigned to and the next step on each one.';
  return <>
    <PageHeader eyebrow={access.isSenior ? 'Operations dashboard' : 'Your work queue'} title={`Good day, ${firstName}.`} description={description} action={<button className="primary" onClick={() => go('claims')}>Open claims</button>} />
    <section className="metrics">
      <Metric value={queue.items.length} label="Needs your action" detail={queue.items.length ? 'Listed below, most urgent first' : 'You are up to date'} tone={queue.items.length ? 'amber' : 'green'} />
      <Metric value={queue.overdue} label="Overdue" detail="Past the internal service target" tone={queue.overdue ? 'red' : 'green'} />
      <Metric value={queue.waitingOnClient} label="Waiting on clients" detail="Information requested" />
      <Metric value={`${queue.oldestOpenDays} d`} label="Oldest open case" detail={`${queue.open} open ${queue.open === 1 ? 'case' : 'cases'}`} />
    </section>
    <section className="dashboard-grid">
      <article className="panel wide">
        <div className="panel-title"><div><span className="eyebrow">Action queue</span><h2>What to do next</h2></div></div>
        {queue.items.length ? <div className="table-wrap"><table className="claim-table"><thead><tr><th>Action</th><th>Case</th><th className="col-secondary">Why</th><th>Waiting</th><th /></tr></thead><tbody>{queue.items.slice(0, 12).map((item) => <tr key={item.id} className="clickable" onClick={() => go(item.page)}>
          <td><strong>{item.action}</strong>{item.overdue && <small className="overdue">Overdue</small>}</td>
          <td>{item.claim ? <><strong>{item.claim.claimNumber}</strong><small>{clientName(portfolio, item.claim.owner)}</small></> : <><strong>{item.application?.applicationNumber ?? 'Application'}</strong><small>Underwriting</small></>}</td>
          <td className="col-secondary">{item.reason}</td><td><strong>{item.ageDays} d</strong></td><td><button className="text-button">Go →</button></td></tr>)}</tbody></table></div>
          : <EmptyState title="Nothing needs you right now" copy="New work appears here as cases move. Waiting on a client or another officer does not need action from you." />}
      </article>
      <article className="panel">
        <span className="eyebrow">Portfolio</span><h2>Open cases by status</h2>
        {statuses.length ? <ul className="status-bars">{statuses.map(([status, count]) => <li key={status}><span>{titleCase(status)}</span><i style={{ width: `${(count / max) * 100}%` }} /><b>{count}</b></li>)}</ul> : <p className="empty">No open cases.</p>}
        <small className="muted">Last refreshed {dateTime(new Date().toISOString())}</small>
      </article>
    </section>
  </>;
}
