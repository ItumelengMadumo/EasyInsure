import { useEffect, useRef, useState } from 'react';
import { resetDemoData } from '../lib/demo/client';
import { exitDemo } from '../lib/demo/exit';
import { DEMO_ROLES, getDemoRole, PERSONAS, switchDemoRole, type DemoRole } from '../lib/demo/mode';
import { titleCase } from '../lib/format';

const COLLAPSED_KEY = 'ei-demo-bar-collapsed';
const read = () => { try { return sessionStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; } };

/**
 * A slim strip at the top of the page (never over the content or a dialog's buttons). The page layout
 * reads its height from --demo-bar, so the sidebar and content shift down instead of being covered.
 */
export function DemoBanner() {
  const role = getDemoRole() ?? 'client';
  const [collapsed, setCollapsed] = useState(read);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const measure = () => root.style.setProperty('--demo-bar', `${collapsed ? 0 : bar.current?.offsetHeight ?? 0}px`);
    measure();
    const observer = new ResizeObserver(measure);
    if (bar.current) observer.observe(bar.current);
    return () => { observer.disconnect(); root.style.setProperty('--demo-bar', '0px'); };
  }, [collapsed]);

  function toggle(next: boolean) {
    setCollapsed(next);
    try { sessionStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* the choice just will not persist */ }
  }

  if (collapsed) return <button className="demo-pill" onClick={() => toggle(false)} aria-label="Show demo controls">Demo · {titleCase(role)} ▾</button>;
  return <div className="demo-banner" ref={bar} role="region" aria-label="Demo mode">
    <span className="demo-badge">Demo</span>
    <label>Viewing as
      <select value={role} onChange={(event) => switchDemoRole(event.target.value as DemoRole)}>
        {DEMO_ROLES.map((item) => <option value={item} key={item}>{titleCase(item)} · {PERSONAS[item].name}</option>)}
      </select>
    </label>
    <button onClick={() => { resetDemoData(); window.location.reload(); }}>Reset data</button>
    <button className="demo-exit" onClick={exitDemo}>Exit demo</button>
    <button className="demo-collapse" onClick={() => toggle(true)} aria-label="Hide demo controls">Hide ▴</button>
  </div>;
}
