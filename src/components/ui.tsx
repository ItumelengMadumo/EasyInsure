import type { ReactNode } from 'react';
import { money, shortDate, titleCase } from '../lib/format';
import type { Claim } from '../types';

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
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

export function ClaimTable({ claims, onSelect }: { claims: Claim[]; onSelect?: (claim: Claim) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Claim</th><th>Type</th><th>Requested</th><th>Risk / Tier</th><th>Status</th><th /></tr></thead><tbody>
    {claims.length ? claims.map((claim) => <tr key={claim.id}>
      <td><strong>{claim.claimNumber}</strong><small>{shortDate(claim.incidentDate)}</small></td>
      <td>{titleCase(claim.claimType)}</td>
      <td>{money.format(claim.amountRequested)}</td>
      <td><strong>{claim.riskScore != null ? `${Math.round(claim.riskScore)}/100` : 'Pending'}</strong><small>Tier {claim.tier ?? '—'}</small></td>
      <td><Status value={claim.status} /></td>
      <td>{onSelect && <button className="text-button" onClick={() => onSelect(claim)}>Open →</button>}</td>
    </tr>) : <tr><td colSpan={6}><EmptyState title="No claims here" copy="Claims matching this view will appear here." /></td></tr>}
  </tbody></table></div>;
}
