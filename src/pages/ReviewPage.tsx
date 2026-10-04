import { useState } from 'react';
import { ClaimTable, EmptyState, PageHeader, Status } from '../components/ui';
import { client } from '../lib/data';
import { money, titleCase } from '../lib/format';
import type { Claim, Portfolio } from '../types';

type Props = { portfolio: Portfolio; groups: string[]; refresh: () => Promise<void>; notify: (message: string) => void };
export function ReviewPage({ portfolio, groups, refresh, notify }: Props) {
  const queue = portfolio.claims.filter((claim) => claim.status === 'DECISION_PENDING');
  const [selected, setSelected] = useState<Claim | null>(queue[0] ?? null);
  const senior = groups.some((group) => ['senior_officer', 'superuser'].includes(group));
  const [payout, setPayout] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);
  const active = selected && queue.some((claim) => claim.id === selected.id) ? selected : queue[0] ?? null;
  const proposed = payout === '' ? active?.suggestedPayout ?? 0 : Number(payout);
  const overriding = active != null && proposed !== (active.suggestedPayout ?? 0);
  function choose(claim: Claim) { setSelected(claim); setPayout(''); setOverrideReason(''); setRejectReason(''); }
  async function decide(action: 'approve' | 'reject') {
    if (!active || busy) return;
    if (action === 'approve' && (!Number.isFinite(proposed) || proposed < 0)) return notify('Enter a valid payout amount.');
    if (action === 'approve' && overriding && overrideReason.trim().length < 5) return notify('Explain why the payout differs from the assessed amount.');
    if (action === 'reject' && rejectReason.trim().length < 5) return notify('Give the client a clear reason for the rejection.');
    if (!window.confirm(action === 'approve' ? `Approve a payout of ${money.format(proposed)} for ${active.claimNumber}?` : `Reject ${active.claimNumber}? The client will see your reason.`)) return;
    setBusy(true);
    try {
      const keys = { idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() };
      const result = action === 'approve'
        ? await client.mutations.approveClaim({ claimId: active.id, approvedPayout: proposed, overrideReason: overriding ? overrideReason.trim() : undefined, ...keys })
        : await client.mutations.rejectClaim({ claimId: active.id, reason: rejectReason.trim(), ...keys });
      if (result.errors?.length) notify(result.errors[0].message);
      else { notify(`Claim ${action === 'approve' ? 'approved' : 'rejected'} and audit event recorded.`); setSelected(null); setPayout(''); setOverrideReason(''); setRejectReason(''); await refresh(); }
    } catch (error) { notify(error instanceof Error ? error.message : 'The decision could not be recorded.'); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeader eyebrow="Human decision gate" title="Review with context." description="Deterministic calculations and AI summaries support the officer; they never replace the officer." />
    {!queue.length ? <EmptyState title="The review queue is clear" copy="Finalized evidence assessments requiring an authorized decision will appear here." /> : <div className="review-layout"><section className="panel queue"><div className="panel-title"><div><span className="eyebrow">Assigned queue</span><h2>{queue.length} awaiting review</h2></div></div><ClaimTable claims={queue} onSelect={choose} /></section>{active && <section className="panel decision"><div className="decision-head"><div><span className="eyebrow">{active.claimNumber}</span><h2>{titleCase(active.claimType)}</h2></div><Status value={active.status} /></div><div className="decision-amount"><span>Suggested payout</span><strong>{money.format(active.suggestedPayout ?? 0)}</strong><small>Evidence-reviewed covered loss, bounded by policy rules</small></div><div className="analysis-grid"><div><small>Approved payout</small><strong>{active.approvedPayout != null ? money.format(active.approvedPayout) : 'Awaiting decision'}</strong></div><div><small>Risk score</small><strong>{active.riskScore != null ? `${Math.round(active.riskScore)}/100` : '—'}</strong></div><div><small>Processing tier</small><strong>Tier {active.tier ?? '—'}</strong></div></div>{active.fraudFlag && <div className="fraud-note"><strong>Rule indicator needs attention</strong><p>{active.fraudReason || 'One or more deterministic fraud rules were triggered.'}</p></div>}<div className="ai-note"><span>AI</span><div><strong>Advisory only</strong><p>Use the evidence and calculated values to make your own determination.</p></div></div>{senior && <div className="form-grid compact"><label className="field"><span>Approved payout (ZAR)</span><input type="number" min="0" step="0.01" value={payout === '' ? String(active.suggestedPayout ?? 0) : payout} onChange={(event) => setPayout(event.target.value)} /></label>{overriding && <label className="field"><span>Override reason (required)</span><textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} /></label>}<label className="field"><span>Rejection reason (shown to client)</span><textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} /></label></div>}<div className="decision-actions"><button className="reject-button" disabled={!senior || busy} onClick={() => decide('reject')}>Reject with reason</button><button className="primary" disabled={!senior || busy} onClick={() => decide('approve')}>{busy ? 'Recording…' : 'Approve payout'}</button></div>{!senior && <small className="permission-note">Senior officer permission is required for a final decision.</small>}</section>}</div>}
  </>;
}
