import { useEffect, useState } from 'react';
import { PageHeader } from '../components/ui';
import { personaByRole, personas } from '../lib/personas';
import type { BusinessRole } from '../types';

type Props = {
  groups: string[];
  profileRole?: string | null;
  previewRole: BusinessRole | null;
  startPreview: (role: BusinessRole) => void;
};

export function PersonaLabPage({ groups, profileRole, previewRole, startPreview }: Props) {
  const [selected, setSelected] = useState<BusinessRole>(previewRole ?? 'client');
  const [completed, setCompleted] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(sessionStorage.getItem('easyinsure-persona-checklist') ?? '{}'); } catch { return {}; }
  });
  const persona = personaByRole(selected);
  useEffect(() => { sessionStorage.setItem('easyinsure-persona-checklist', JSON.stringify(completed)); }, [completed]);

  return <>
    <PageHeader eyebrow="Development workflow lab" title="See EasyInsure through every user’s eyes." description="Preview real workspace components with synthetic, read-only insurance cases. Use real accounts separately when validating Cognito authorization." />
    <section className="persona-diagnostics panel">
      <div><span>Signed-in groups</span><strong>{groups.join(', ') || 'None resolved'}</strong></div>
      <div><span>Profile role</span><strong>{profileRole || 'Not resolved'}</strong></div>
      <div><span>Lab boundary</span><strong>Development only · synthetic data</strong></div>
    </section>
    <section className="persona-grid">
      {personas.map((item) => <button key={item.role} className={`persona-card ${selected === item.role ? 'selected' : ''}`} onClick={() => setSelected(item.role)}>
        <span>{item.label}</span><strong>{item.name}</strong><p>{item.purpose}</p>
      </button>)}
    </section>
    <section className="persona-detail-grid">
      <article className="panel">
        <span className="eyebrow">Effective access</span><h2>{persona.label}</h2><p>{persona.purpose}</p>
        <h3>Can do</h3><ul>{persona.permitted.map((item) => <li key={item}>{item}</li>)}</ul>
        <h3>Must not do</h3><ul className="forbidden">{persona.forbidden.map((item) => <li key={item}>{item}</li>)}</ul>
        <button className="primary full" onClick={() => startPreview(persona.role)}>Preview {persona.label} workspace</button>
      </article>
      <article className="panel">
        <span className="eyebrow">Golden journey</span><h2>Things to poke at</h2>
        <div className="persona-checklist">{persona.checklist.map((item, index) => {
          const key = `${persona.role}-${index}`;
          return <label key={key}><input type="checkbox" checked={Boolean(completed[key])} onChange={(event) => setCompleted({ ...completed, [key]: event.target.checked })} /><span><strong>{item.task}</strong><small>{item.expected}</small></span></label>;
        })}</div>
      </article>
      <article className="panel real-account">
        <span className="eyebrow">Real authorization test</span><h2>Sign in separately</h2>
        <p>Preview mode tests presentation and workflow clarity. To validate actual permissions, open a private browser window and sign in through Cognito.</p>
        <dl><dt>Development account</dt><dd>{persona.testEmail}</dd><dt>Password</dt><dd>Retrieve from the approved development secret store.</dd></dl>
        <button className="secondary full" onClick={() => navigator.clipboard?.writeText(persona.testEmail)}>Copy test email</button>
      </article>
    </section>
  </>;
}
