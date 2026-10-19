import { useMemo, useState } from 'react';
import { SENIOR_APPROVAL_LIMIT } from '../../amplify/functions/claims-command/domain';
import { ClaimTable, EmptyState, Field, Metric, PageHeader, Status } from '../components/ui';
import { client } from '../lib/data';
import { dateTime, daysSince, money, titleCase } from '../lib/format';
import { assetLabel, clientName, leadAdvisor } from '../lib/portfolio';
import { roleFlags } from '../lib/roles';
import { SLA, buildWorkQueue } from '../lib/workQueue';
import type { Portfolio } from '../types';

type Props = { portfolio: Portfolio; groups: string[]; owner: string; refresh: () => Promise<void>; notify: (message: string) => void };
type Tab = 'reports' | 'assignment' | 'audit' | 'rules' | 'people';
const TABS: [Tab, string][] = [['reports', 'Reports & SLA'], ['assignment', 'Assignment board'], ['audit', 'Audit log'], ['rules', 'Rules & thresholds'], ['people', 'People & roles']];
const keys = () => ({ idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() });

/** Superuser console: the operational overview that was previously scattered or missing. */
export function AdminPage({ portfolio, groups, owner, refresh, notify }: Props) {
  const access = roleFlags(groups);
  const [tab, setTab] = useState<Tab>('reports');
  return <>
    <PageHeader eyebrow="Administration" title="Run the operation." description="Service levels, who is working what, the audit trail, the rules in force, and who has access. Everything here is read from live data." />
    <div className="filter-tabs" role="tablist" aria-label="Admin sections">{TABS.map(([id, label]) => <button role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}>{label}</button>)}</div>
    {tab === 'reports' && <Reports portfolio={portfolio} access={access} owner={owner} />}
    {tab === 'assignment' && <AssignmentBoard portfolio={portfolio} access={access} refresh={refresh} notify={notify} />}
    {tab === 'audit' && <AuditLog portfolio={portfolio} />}
    {tab === 'rules' && <Rules />}
    {tab === 'people' && <People portfolio={portfolio} />}
  </>;
}

function Reports({ portfolio, access, owner }: { portfolio: Portfolio; access: ReturnType<typeof roleFlags>; owner: string }) {
  const [now] = useState(() => Date.now());
  const queue = buildWorkQueue(portfolio, access, owner, now);
  const decided = portfolio.claims.filter((claim) => claim.approvedBy || ['APPROVED', 'PAYMENT_PENDING', 'PAID', 'REJECTED', 'CLOSED'].includes(claim.status));
  const rejected = decided.filter((claim) => claim.status === 'REJECTED').length;
  const paid = portfolio.claims.reduce((sum, claim) => sum + (['PAID', 'CLOSED'].includes(claim.status) ? claim.approvedPayout ?? 0 : 0), 0);
  const approvedValue = portfolio.claims.reduce((sum, claim) => sum + (claim.approvedPayout ?? 0), 0);
  const ageing = [['0–2 days', 0, 2], ['3–7 days', 3, 7], ['8+ days', 8, Infinity]].map(([label, low, high]) => ({
    label: String(label), count: portfolio.claims.filter((claim) => !['PAID', 'CLOSED', 'REJECTED', 'DRAFT'].includes(claim.status) && daysSince(claim.lastActivityAt) >= Number(low) && daysSince(claim.lastActivityAt) <= Number(high)).length,
  }));
  const overdueAssignments = portfolio.claims.filter((claim) => claim.status === 'ASSIGNMENT_PENDING' && claim.assignmentDueAt && Date.parse(claim.assignmentDueAt) < now).length;
  const max = Math.max(1, ...ageing.map((item) => item.count));
  return <>
    <section className="metrics">
      <Metric value={queue.open} label="Open claims" detail={`${queue.waitingOnClient} waiting on clients`} />
      <Metric value={queue.overdue + overdueAssignments} label="Past service target" detail="See the thresholds tab" tone={queue.overdue + overdueAssignments ? 'red' : 'green'} />
      <Metric value={decided.length ? `${Math.round(((decided.length - rejected) / decided.length) * 100)}%` : '—'} label="Approval rate" detail={`${decided.length} decided claims`} />
      <Metric value={money.format(paid)} label="Paid out" detail={`${money.format(approvedValue)} approved in total`} />
    </section>
    <section className="dashboard-grid">
      <article className="panel wide"><span className="eyebrow">Ageing</span><h2>Open claims by time since last activity</h2>
        <ul className="status-bars">{ageing.map((item) => <li key={item.label}><span>{item.label}</span><i style={{ width: `${(item.count / max) * 100}%` }} /><b>{item.count}</b></li>)}</ul></article>
      <article className="panel"><span className="eyebrow">Service targets</span><h2>Overdue now</h2>
        {queue.items.filter((item) => item.overdue).length ? <ul className="waiting-list compact">{queue.items.filter((item) => item.overdue).slice(0, 6).map((item) => <li key={item.id}><div><strong>{item.action}</strong><small>{item.claim?.claimNumber ?? item.application?.applicationNumber} · {item.ageDays} days</small></div></li>)}</ul> : <p className="empty">Nothing is past its target.</p>}</article>
    </section>
  </>;
}

function AssignmentBoard({ portfolio, access, refresh, notify }: { portfolio: Portfolio; access: ReturnType<typeof roleFlags>; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const [selected, setSelected] = useState<string>('');
  const staff = portfolio.profiles.filter((item) => ['junior_officer', 'intermediate_officer', 'senior_officer'].includes(item.businessRole) && item.status === 'active');
  const open = portfolio.claims.filter((claim) => !['PAID', 'CLOSED', 'REJECTED', 'DRAFT'].includes(claim.status));
  const load = (subject: string) => portfolio.assignments.filter((item) => item.active && item.userSubject === subject && open.some((claim) => claim.id === item.claimId)).length;
  const needsAdvisor = open.filter((claim) => !leadAdvisor(portfolio, claim.id));
  async function assign(claimId: string, subject: string) {
    const profile = staff.find((item) => item.owner === subject);
    if (!profile) return;
    const result = await client.mutations.assignClaimTeamMember({ claimId, userSubject: profile.owner, displayName: profile.displayName || profile.email, userRole: profile.businessRole, assignmentRole: 'LEAD_ADVISOR', isLead: true, ...keys() });
    if (result.errors?.length) notify(result.errors[0].message); else { notify(`${profile.displayName} is now the lead advisor.`); await refresh(); }
  }
  return <section className="dashboard-grid">
    <article className="panel wide"><span className="eyebrow">Unassigned</span><h2>Claims without a lead advisor</h2>
      {needsAdvisor.length ? <div className="table-wrap"><table className="claim-table"><thead><tr><th>Claim</th><th>Client</th><th>Waiting</th><th>Assign to</th></tr></thead><tbody>{needsAdvisor.map((claim) => <tr key={claim.id}><td><strong>{claim.claimNumber}</strong><small>{assetLabel(portfolio, claim)}</small></td><td>{clientName(portfolio, claim.owner)}</td><td>{daysSince(claim.submittedAt)} d</td><td><select aria-label={`Assign ${claim.claimNumber}`} value="" onChange={(event) => assign(claim.id, event.target.value)}><option value="">Choose an advisor…</option>{staff.map((item) => <option key={item.id} value={item.owner}>{item.displayName} · {load(item.owner)} open</option>)}</select></td></tr>)}</tbody></table></div> : <EmptyState title="Every open claim has a lead advisor" copy="New claims are assigned automatically; any that are not appear here." />}</article>
    <article className="panel"><span className="eyebrow">Workload</span><h2>Open cases per officer</h2>
      <ul className="status-bars">{staff.map((item) => <li key={item.id}><span>{item.displayName}</span><i style={{ width: `${(load(item.owner) / Math.max(1, ...staff.map((s) => load(s.owner)))) * 100}%` }} /><b>{load(item.owner)}</b></li>)}</ul>
      <Field label="Review a single officer's cases"><select value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Choose an officer…</option>{staff.map((item) => <option key={item.id} value={item.owner}>{item.displayName}</option>)}</select></Field></article>
    {selected && <article className="panel wide"><span className="eyebrow">Cases</span><h2>{staff.find((item) => item.owner === selected)?.displayName}</h2>
      <ClaimTable claims={open.filter((claim) => portfolio.assignments.some((item) => item.active && item.claimId === claim.id && item.userSubject === selected))} access={access} portfolio={portfolio} /></article>}
  </section>;
}

/** Case activity, client-visible and staff-only. The before/after values on AuditEvent records are not loaded here yet. */
function AuditLog({ portfolio }: { portfolio: Portfolio }) {
  const [filter, setFilter] = useState('');
  const events = useMemo(() => [...portfolio.activities].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), [portfolio.activities]);
  const shown = events.filter((item) => !filter || `${item.summary} ${item.actorDisplayNameSnapshot} ${item.eventType}`.toLowerCase().includes(filter.toLowerCase()));
  const claimNumber = (id: string) => portfolio.claims.find((claim) => claim.id === id)?.claimNumber ?? id.slice(0, 8);
  return <section className="panel table-panel"><div className="panel-title"><div><span className="eyebrow">Audit trail</span><h2>Case events, newest first</h2><p className="muted">Every action on a case is recorded with who did it and when.</p></div></div>
    <label className="search">⌕ <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter by person, claim or action…" aria-label="Filter audit events" /></label>
    {shown.length ? <div className="table-wrap"><table className="claim-table"><thead><tr><th>When</th><th>Claim</th><th>Who</th><th>What happened</th><th className="col-secondary">Visible to client</th></tr></thead><tbody>{shown.slice(0, 50).map((item) => <tr key={item.id}><td>{dateTime(item.occurredAt)}</td><td><strong>{claimNumber(item.claimId)}</strong></td><td>{item.actorDisplayNameSnapshot}<small>{titleCase(item.actorRoleSnapshot)}</small></td><td>{item.summary}{item.detail && <small>{item.detail}</small>}</td><td className="col-secondary">{item.visibility === 'INTERNAL' ? 'No' : 'Yes'}</td></tr>)}</tbody></table></div> : <EmptyState title="No events match" copy="Try a different filter." />}
  </section>;
}

function Rules() {
  const rows: [string, string, string][] = [
    ['Senior approval limit', money.format(SENIOR_APPROVAL_LIMIT), 'Senior officers decide up to this amount; larger payouts need a superuser.'],
    ['Separation of duties', 'Always on', 'The officer who prepared or finalised an assessment cannot decide the claim, and nobody decides their own claim.'],
    ['Assignment target', '15 minutes', 'A claim should have a lead advisor within 15 minutes of submission; the scheduler retries every 5 minutes.'],
    ['Client reply follow-up', `${SLA.infoNeededDays} days`, 'Cases waiting on the client longer than this are flagged for a chase.'],
    ['Assessment target', `${SLA.assessmentDays} days`, 'Time to complete an assessment before it is flagged as overdue.'],
    ['Decision target', `${SLA.decisionDays} days`, 'Time for a senior officer to decide or finalise before it is flagged.'],
    ['Payment target', `${SLA.paymentDays} days`, 'Time to prepare and record a payout after approval.'],
    ['Evidence limits', '10 MB documents · 50 MB video', 'PDF, JPEG, PNG, HEIC, MP4 and MOV. Files are malware-scanned before use.'],
    ['Tiers', '≤ R50,000 · ≤ R200,000 · above', 'Claim tier by amount, used to route and weigh the risk checks.'],
  ];
  return <section className="panel"><span className="eyebrow">Rules in force</span><h2>Thresholds and limits</h2><p className="muted">These are fixed in the platform. Changing one is a code change that is reviewed and tested, so they are shown here for transparency rather than edited.</p>
    <dl className="rules-list">{rows.map(([name, value, note]) => <div key={name}><dt>{name}<small>{note}</small></dt><dd>{value}</dd></div>)}</dl></section>;
}

function People({ portfolio }: { portfolio: Portfolio }) {
  const people = portfolio.profiles;
  return <section className="panel table-panel"><div className="panel-title"><div><span className="eyebrow">Access</span><h2>People and roles</h2><p className="muted">Roles come from Cognito groups. Staff are added to the right group by an administrator; self-registration always creates a client.</p></div></div>
    {people.length ? <div className="table-wrap"><table className="claim-table"><thead><tr><th>Name</th><th>Role</th><th className="col-secondary">Email</th><th>Status</th></tr></thead><tbody>{people.map((item) => <tr key={item.id}><td><strong>{item.displayName || 'Unnamed'}</strong></td><td>{titleCase(item.businessRole)}</td><td className="col-secondary">{item.email}</td><td><Status value={item.status} /></td></tr>)}</tbody></table></div> : <EmptyState title="No profiles" copy="Profiles appear when people first sign in." />}
  </section>;
}
