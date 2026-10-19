import type { KeyboardEvent, ReactNode } from 'react';
import { daysSince, shortDate, titleCase } from '../lib/format';
import { assetLabel, clientName, leadAdvisor } from '../lib/portfolio';
import type { Access } from '../lib/roles';
import { clientStatus, riskLevel } from '../lib/status';
import type { Claim, Portfolio } from '../types';

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

export function Field({ label, hint, className = '', children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return <label className={`field ${className}`.trim()}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Metric({ value, label, detail, tone = '' }: { value: string | number; label: string; detail?: string; tone?: string }) {
  return <article className={`metric ${tone}`}><div className="metric-mark" /><strong>{value}</strong><span>{label}</span>{detail && <small>{detail}</small>}</article>;
}

export function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><span>○</span><strong>{title}</strong><p>{copy}</p></div>;
}

export function Status({ value }: { value: string }) {
  return <span className={`status ${value.toLowerCase()}`}>{titleCase(value)}</span>;
}

/** The status wording a client sees ("Waiting on you", not INFO_NEEDED). */
export function ClientStatusBadge({ status }: { status: string }) {
  const { label, tone } = clientStatus(status);
  return <span className={`status tone-${tone}`}>{label}</span>;
}

const onEnter = (action: () => void) => (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); } };
const FINISHED = ['PAID', 'CLOSED', 'REJECTED'];

/**
 * Clients get plain-language status and what happens next; staff get who, how long and risk.
 * The risk score and tier are internal signals and are never rendered for a client.
 */
export function ClaimTable({ claims, onSelect, access, portfolio }: { claims: Claim[]; onSelect?: (claim: Claim) => void; access: Access; portfolio: Portfolio }) {
  const staff = access.isStaff;
  const columns = staff ? 8 : 5;
  return <div className="table-wrap"><table className="claim-table"><thead><tr>
    <th>Claim</th>{staff ? <><th>Client</th><th className="col-secondary">Asset</th><th className="col-secondary">Lead advisor</th><th>Waiting</th><th>Risk</th></> : <><th>Type</th></>}
    <th>Status</th>{!staff && <th className="col-secondary">What happens next</th>}<th />
  </tr></thead><tbody>
    {claims.length ? claims.map((claim) => {
      const open = () => onSelect?.(claim);
      const lead = leadAdvisor(portfolio, claim.id);
      return <tr key={claim.id} className={onSelect ? 'clickable' : ''} onClick={open} tabIndex={onSelect ? 0 : undefined} onKeyDown={onSelect ? onEnter(open) : undefined}>
        <td><strong>{claim.claimNumber ?? 'Draft'}</strong><small>Incident {shortDate(claim.incidentDate)}</small><small>Submitted {shortDate(claim.submittedAt)}</small></td>
        {staff ? <>
          <td>{clientName(portfolio, claim.owner)}</td>
          <td className="col-secondary">{assetLabel(portfolio, claim)}<small>{titleCase(claim.claimType)}</small></td>
          <td className="col-secondary">{lead?.userDisplayNameSnapshot ?? <em>Unassigned</em>}</td>
          <td>{FINISHED.includes(claim.status) ? '—' : <><strong>{daysSince(claim.lastActivityAt)} d</strong><small>since last activity</small></>}</td>
          <td>{claim.riskScore != null ? <><strong>{titleCase(riskLevel(claim.riskScore))}</strong><small>Tier {claim.tier ?? '—'}{claim.fraudFlag ? ' · flagged' : ''}</small></> : <strong>Pending</strong>}</td>
          <td><Status value={claim.status} /></td>
        </> : <>
          <td>{titleCase(claim.claimType)}<small>{assetLabel(portfolio, claim)}</small></td>
          <td><ClientStatusBadge status={claim.status} /></td>
          <td className="col-secondary">{clientStatus(claim.status).next}</td>
        </>}
        <td>{onSelect && <button className="text-button" onClick={(event) => { event.stopPropagation(); open(); }}>Open →</button>}</td>
      </tr>;
    }) : <tr><td colSpan={columns + 1}><EmptyState title="No claims here" copy="Claims matching this view will appear here." /></td></tr>}
  </tbody></table></div>;
}
