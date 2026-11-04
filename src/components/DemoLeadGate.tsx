import { useState } from 'react';
import { submitDemoLead } from '../lib/demo/lead';
import type { DemoRole } from '../lib/demo/mode';
import { useModal } from '../lib/useModal';
import { Field } from './ui';

/** Shown once per demo session, right before the chosen workspace opens. Not an account: no
 * password, nothing to confirm by email. Skipping is always one click away. */
export function DemoLeadGate({ role, source, onDone }: { role: DemoRole; source: string; onDone: () => void }) {
  const modal = useModal(undefined, "Who's checking out the demo?");
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSend = name.trim().length > 0 && emailLooksValid;

  async function finish(lead: { name: string; email: string; company?: string } | null) {
    setSubmitting(true);
    await submitDemoLead(lead, role, source);
    onDone();
  }

  return <div className="wizard-backdrop"><section className="demo-lead-gate" {...modal}>
    <header>
      <span className="eyebrow">No account, no password</span>
      <h2>Who's checking out EasyInsure?</h2>
      <p>This isn't a sign-up — we just like to know who's exploring the demo, and it lets us put your own name and company into the sample workspace. Totally optional.</p>
    </header>
    <form onSubmit={(event) => { event.preventDefault(); if (canSend) finish({ name: name.trim(), email: email.trim(), company: company.trim() || undefined }); }}>
      <Field label="Your name"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Thandi Mokoena" autoFocus /></Field>
      <Field label="Work email"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.co.za" /></Field>
      <Field label="Company (optional)"><input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="e.g. Albatross Insurance" /></Field>
      <div className="demo-lead-actions">
        <button type="button" className="text-button" disabled={submitting} onClick={() => finish(null)}>Skip for now</button>
        <button type="submit" className="primary" disabled={!canSend || submitting}>{submitting ? 'One moment…' : 'See my demo'}</button>
      </div>
    </form>
  </section></div>;
}
