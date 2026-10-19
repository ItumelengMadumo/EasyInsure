import { FormEvent, ReactNode, useState } from 'react';
import { useModal } from '../lib/useModal';
import { Field } from './ui';

export type ConfirmField = { name: string; label: string; hint?: string; placeholder?: string; type?: 'text' | 'textarea'; required?: boolean; minLength?: number };

/**
 * A proper dialog for decisions that should not be a browser prompt: it says what will happen,
 * collects any reason or reference, and keeps working (Escape, focus trap, labelled) like the other dialogs.
 */
export function ConfirmModal({ title, description, summary, fields = [], confirmLabel, tone = 'primary', onCancel, onConfirm }: {
  title: string; description?: string; summary?: ReactNode; fields?: ConfirmField[]; confirmLabel: string;
  tone?: 'primary' | 'danger'; onCancel: () => void; onConfirm: (values: Record<string, string>) => Promise<void> | void;
}) {
  const modal = useModal<HTMLFormElement>(onCancel, title);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try { await onConfirm(Object.fromEntries(fields.map((field) => [field.name, String(form.get(field.name) ?? '').trim()]))); }
    finally { setBusy(false); }
  }
  return <div className="wizard-backdrop confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <form className="confirm-modal" {...modal} onSubmit={submit}>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {summary && <div className="confirm-summary">{summary}</div>}
      {fields.map((field) => <Field key={field.name} label={field.label} hint={field.hint}>
        {field.type === 'textarea'
          ? <textarea name={field.name} rows={3} placeholder={field.placeholder} required={field.required} minLength={field.minLength} />
          : <input name={field.name} placeholder={field.placeholder} required={field.required} minLength={field.minLength} />}
      </Field>)}
      <div className="form-actions"><button type="button" className="secondary" onClick={onCancel} disabled={busy}>Cancel</button><button className={tone === 'danger' ? 'reject-button' : 'primary'} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button></div>
    </form>
  </div>;
}
