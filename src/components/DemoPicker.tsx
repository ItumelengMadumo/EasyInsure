import { DEMO_ROLES, PERSONAS, switchDemoRole } from '../lib/demo/mode';
import { titleCase } from '../lib/format';
import { useModal } from '../lib/useModal';

export function DemoPicker({ onClose }: { onClose: () => void }) {
  const modal = useModal(onClose, 'Choose a demo role');
  return <div className="wizard-backdrop" onClick={onClose}><section className="demo-picker" {...modal} onClick={(event) => event.stopPropagation()}>
    <header><div><span className="eyebrow">No account needed</span><h2>Explore EasyInsure as…</h2><p>Pick a role to open a sample workspace. You can switch roles at any time. Nothing you do is saved to a real account.</p></div><button className="icon-button" onClick={onClose} aria-label="Close">×</button></header>
    <div className="demo-roles">{DEMO_ROLES.map((role) => <button key={role} onClick={() => switchDemoRole(role)}><strong>{titleCase(role)}</strong><small>{PERSONAS[role].name}</small><p>{PERSONAS[role].blurb}</p></button>)}</div>
  </section></div>;
}
