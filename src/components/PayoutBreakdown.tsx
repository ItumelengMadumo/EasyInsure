import { explainPayout } from '../../amplify/functions/claims-command/underwriting';
import { money } from '../lib/format';

type Input = { coveredLossValue: number; repairEstimate?: number | null; replacementEstimate?: number | null; policyLimit: number; excess: number; depreciation: number };

const signed = (amount: number) => `${amount < 0 ? '−' : amount > 0 ? '+' : ''} ${money.format(Math.abs(amount))}`.trim();

/** Shows how a payout figure was reached, step by step, using the same arithmetic the backend runs. */
export function PayoutBreakdown({ input, title = 'How this was calculated' }: { input: Input; title?: string }) {
  const { steps } = explainPayout(input);
  return <section className="payout-breakdown" aria-label={title}>
    <h4>{title}</h4>
    <ol>{steps.map((step) => <li className={step.kind} key={step.label}>
      <span><strong>{step.label}</strong><small>{step.note}</small></span>
      <b>{step.kind === 'start' || step.kind === 'result' ? money.format(step.amount) : signed(step.amount)}</b>
    </li>)}</ol>
  </section>;
}
