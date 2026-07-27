import { useState } from 'react';
import { ClaimTable, EmptyState, PageHeader, Status } from '../components/ui';
import { client } from '../lib/data';
import { money, titleCase } from '../lib/format';
import type { Claim, PersonaCapabilities, Portfolio } from '../types';

type Props = { portfolio: Portfolio; capabilities: PersonaCapabilities; refresh: () => Promise<void>; notify: (message: string) => void };
export function ReviewPage({ portfolio, capabilities, refresh, notify }: Props) {
  const queue = portfolio.claims.filter((claim) => claim.status === 'DECISION_PENDING');
  const [selected, setSelected] = useState<Claim | null>(queue[0] ?? null);
  const senior = capabilities.canDecideClaims;
  async function decide(action: 'approve' | 'reject') {
    if (!selected) return;
    const result = action === 'approve'
      ? await client.mutations.approveClaim({ claimId: selected.id, approvedPayout: selected.suggestedPayout ?? 0, correlationId: crypto.randomUUID() })
      : await client.mutations.rejectClaim({ claimId: selected.id, reason: 'Rejected following human officer assessment.', correlationId: crypto.randomUUID() });
    if (result.errors?.length) notify(result.errors[0].message); else { notify(`Claim ${action === 'approve' ? 'approved' : 'rejected'} and audit event recorded.`); setSelected(null); await refresh(); }
  }
  return <>
    <PageHeader eyebrow="Human decision gate" title="Review with context." description="Deterministic calculations and AI summaries support the officer; they never replace the officer." />
    {!queue.length ? <EmptyState title="The review queue is clear" copy="Finalized evidence assessments requiring an authorized decision will appear here." /> : <div className="review-layout"><section className="panel queue"><div className="panel-title"><div><span className="eyebrow">Assigned queue</span><h2>{queue.length} awaiting review</h2></div></div><ClaimTable claims={queue} onSelect={setSelected} /></section>{selected && <section className="panel decision"><div className="decision-head"><div><span className="eyebrow">{selected.claimNumber}</span><h2>{titleCase(selected.claimType)}</h2></div><Status value={selected.status} /></div><div className="decision-amount"><span>Suggested payout</span><strong>{money.format(selected.suggestedPayout ?? 0)}</strong><small>Evidence-reviewed covered loss, bounded by policy rules</small></div><div className="analysis-grid"><div><small>Approved payout</small><strong>{selected.approvedPayout != null ? money.format(selected.approvedPayout) : 'Awaiting decision'}</strong></div><div><small>Risk score</small><strong>{selected.riskScore != null ? `${Math.round(selected.riskScore)}/100` : '—'}</strong></div><div><small>Processing tier</small><strong>Tier {selected.tier ?? '—'}</strong></div></div>{selected.fraudFlag && <div className="fraud-note"><strong>Rule indicator needs attention</strong><p>{selected.fraudReason || 'One or more deterministic fraud rules were triggered.'}</p></div>}<div className="ai-note"><span>AI</span><div><strong>Advisory only</strong><p>Use the evidence and calculated values to make your own determination.</p></div></div><div className="decision-actions"><button className="reject-button" disabled={!senior} onClick={() => decide('reject')}>Reject with reason</button><button className="primary" disabled={!senior} onClick={() => decide('approve')}>Approve payout</button></div>{!senior && <small className="permission-note">Senior officer permission is required for a final decision.</small>}</section>}</div>}
  </>;
}
