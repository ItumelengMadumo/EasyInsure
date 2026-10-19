import { EmptyState, Metric, PageHeader, Status } from '../components/ui';
import { daysSince, dateTime, titleCase } from '../lib/format';
import type { Portfolio } from '../types';

/** Developer view: workflow and job health only. Client identity, narrative and documents are removed server-side. */
export function DiagnosticsPage({ portfolio }: { portfolio: Portfolio }) {
  const jobs = [...portfolio.jobs].sort((a, b) => String(b.completedAt ?? b.startedAt ?? b.createdAt ?? '').localeCompare(String(a.completedAt ?? a.startedAt ?? a.createdAt ?? '')));
  const failed = jobs.filter((job) => ['FAILED', 'DEAD_LETTER'].includes(job.status));
  const running = jobs.filter((job) => ['QUEUED', 'RUNNING'].includes(job.status));
  const inFlight = portfolio.claims.filter((claim) => !['PAID', 'CLOSED', 'REJECTED', 'DRAFT'].includes(claim.status));
  const byStatus: Record<string, number> = {};
  inFlight.forEach((claim) => { byStatus[claim.status] = (byStatus[claim.status] ?? 0) + 1; });
  return <>
    <PageHeader eyebrow="Developer diagnostics" title="Workflow health, without client data." description="You can see how cases and background jobs are behaving. Client names, descriptions, documents and messages are removed on the server, and you cannot change or decide cases." />
    <section className="metrics">
      <Metric value={jobs.length - failed.length - running.length} label="Jobs succeeded" detail={`${jobs.length} recorded`} tone="green" />
      <Metric value={failed.length} label="Jobs failed" detail={failed.length ? 'Needs investigation' : 'No failures'} tone={failed.length ? 'red' : 'green'} />
      <Metric value={running.length} label="Jobs running" detail="Queued or in progress" />
      <Metric value={inFlight.length} label="Cases in flight" detail={`Oldest idle ${inFlight.reduce((max, claim) => Math.max(max, daysSince(claim.lastActivityAt)), 0)} days`} />
    </section>
    <section className="dashboard-grid">
      <article className="panel wide">
        <div className="panel-title"><div><span className="eyebrow">Processing</span><h2>Recent assessment jobs</h2></div></div>
        {jobs.length ? <div className="table-wrap"><table className="claim-table"><thead><tr><th>Claim</th><th>Status</th><th>Step</th><th>Attempts</th><th className="col-secondary">Error</th><th>When</th></tr></thead><tbody>{jobs.slice(0, 15).map((job) => <tr key={job.id}>
          <td><strong>{portfolio.claims.find((claim) => claim.id === job.claimId)?.claimNumber ?? job.claimId.slice(0, 8)}</strong></td>
          <td><Status value={job.status} /></td><td>{titleCase(job.currentStep ?? 'queued')}</td><td>{job.attempts ?? 0}</td>
          <td className="col-secondary">{job.errorMessage ?? '—'}{job.errorCategory && <small>{job.errorCategory}</small>}</td><td>{dateTime(job.completedAt ?? job.startedAt ?? job.createdAt)}</td></tr>)}</tbody></table></div> : <EmptyState title="No jobs recorded" copy="Assessment jobs appear here when officers start a claim assessment." />}
      </article>
      <article className="panel">
        <span className="eyebrow">Cases</span><h2>In flight by status</h2>
        {Object.keys(byStatus).length ? <ul className="status-bars">{Object.entries(byStatus).map(([status, count]) => <li key={status}><span>{titleCase(status)}</span><i style={{ width: `${(count / Math.max(...Object.values(byStatus))) * 100}%` }} /><b>{count}</b></li>)}</ul> : <p className="empty">No cases in flight.</p>}
      </article>
    </section>
  </>;
}
