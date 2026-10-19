// Demo mode: lets prospective clients explore every role without an account. Nothing here
// talks to AWS; see client.ts for the in-memory stand-in for the Amplify data client.

export type DemoRole = 'client' | 'junior_officer' | 'intermediate_officer' | 'senior_officer' | 'developer' | 'superuser';

export type Persona = { userId: string; email: string; name: string; role: DemoRole; groups: string[]; blurb: string };

const person = (userId: string, name: string, role: DemoRole, blurb: string): Persona => ({
  userId, name, role, groups: [role], blurb, email: `${name.toLowerCase().replace(/\s+/g, '.')}@demo.easyinsure.example`,
});

export const PERSONAS: Record<DemoRole, Persona> = {
  client: person('demo-client-1', 'Thandi Mokoena', 'client', 'Register assets, apply for cover, accept quotes and lodge claims.'),
  junior_officer: person('demo-junior', 'Lerato Dlamini', 'junior_officer', 'Work the claims assigned to you and keep the client informed.'),
  intermediate_officer: person('demo-intermediate', 'Sipho Nkosi', 'intermediate_officer', 'Assess evidence, calculate payouts and log client calls.'),
  senior_officer: person('demo-senior', 'Naledi Khumalo', 'senior_officer', 'Underwrite applications, finalise assessments and approve payouts.'),
  developer: person('demo-developer', 'Dev Naidoo', 'developer', 'Read-only diagnostics across every case, with no financial authority.'),
  superuser: person('demo-superuser', 'Zanele Admin', 'superuser', 'Full oversight of the whole operation.'),
};

export const DEMO_ROLES = Object.keys(PERSONAS) as DemoRole[];

const ROLE_KEY = 'ei-demo-role';
const enabled = import.meta.env.VITE_DEMO_ENABLED !== 'false';

function storage(): Storage | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}
let memoryRole: DemoRole | null = null;

const isRole = (value: unknown): value is DemoRole => DEMO_ROLES.includes(value as DemoRole);

export const isDemoEnabled = () => enabled;

export function getDemoRole(): DemoRole | null {
  if (!enabled) return null;
  if (typeof window !== 'undefined') {
    // A shareable link such as /?demo=senior_officer starts the demo directly.
    const requested = new URLSearchParams(window.location.search).get('demo');
    if (isRole(requested)) { setDemoRole(requested); return requested; }
  }
  const stored = storage()?.getItem(ROLE_KEY) ?? memoryRole;
  return isRole(stored) ? stored : null;
}

export function setDemoRole(role: DemoRole | null) {
  memoryRole = role;
  try {
    if (role) storage()?.setItem(ROLE_KEY, role); else storage()?.removeItem(ROLE_KEY);
  } catch { /* storage unavailable: the in-memory copy still works for this page load */ }
}

export const isDemo = () => getDemoRole() !== null;
export const demoPersona = (): Persona => PERSONAS[getDemoRole() ?? 'client'];

export function switchDemoRole(role: DemoRole) {
  setDemoRole(role);
  window.location.assign(`${window.location.pathname}?demo=${role}`);
}
