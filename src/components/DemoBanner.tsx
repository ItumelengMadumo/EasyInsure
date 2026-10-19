import { resetDemoData } from '../lib/demo/client';
import { DEMO_ROLES, getDemoRole, PERSONAS, setDemoRole, switchDemoRole, type DemoRole } from '../lib/demo/mode';
import { titleCase } from '../lib/format';

export function exitDemo() {
  setDemoRole(null); resetDemoData();
  window.location.assign(window.location.pathname);
}

export function DemoBanner() {
  const role = getDemoRole() ?? 'client';
  return <div className="demo-banner" role="region" aria-label="Demo mode">
    <span className="demo-badge">Demo</span>
    <label>Viewing as
      <select value={role} onChange={(event) => switchDemoRole(event.target.value as DemoRole)}>
        {DEMO_ROLES.map((item) => <option value={item} key={item}>{titleCase(item)} · {PERSONAS[item].name}</option>)}
      </select>
    </label>
    <button onClick={() => { resetDemoData(); window.location.reload(); }}>Reset data</button>
    <button className="demo-exit" onClick={exitDemo}>Exit demo</button>
  </div>;
}
