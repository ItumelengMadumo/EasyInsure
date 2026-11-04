import { generateClient } from 'aws-amplify/data';
import { getDemoRole, PERSONAS, type DemoRole } from './mode';

// This is the one place demo mode talks to the real backend (see mode.ts): the demo's own
// in-memory client never reaches AWS, so lead capture uses its own real Data client with the
// public API key, independent of whichever role is being explored.
let realClient: any = null;
function apiKeyClient() {
  if (!realClient) realClient = generateClient({ authMode: 'apiKey' });
  return realClient;
}

const GATE_KEY = 'ei-demo-lead-decided';
const LEAD_KEY = 'ei-demo-lead-details';

export type DemoLead = { name: string; email: string; company?: string };

function storage(): Storage | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}

export function hasDecidedOnLeadGate(): boolean {
  // Automated tests skip the gate explicitly; real shareable demo links never carry this param.
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('skipLead') === '1') return true;
  try { return storage()?.getItem(GATE_KEY) === '1'; } catch { return false; }
}

export function getStoredLead(): DemoLead | null {
  try {
    const raw = storage()?.getItem(LEAD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Swaps the generic client persona ("Thandi Mokoena") for the visitor's own name, so the seed
 * data they explore (UserProfile, greetings, "Linked to X's claim" in officer views) reads as
 * theirs. Only the client persona's identity changes; the narrative text already baked into
 * seeded claim timelines and messages still references the generic name — a known limit of
 * swapping a persona after the demo's sample data was written, not fixed here. */
export function applyStoredLeadToPersona() {
  if (getDemoRole() !== 'client') return;
  const lead = getStoredLead();
  if (!lead) return;
  PERSONAS.client.name = lead.name;
  PERSONAS.client.email = lead.email;
}

// Runs once per page load, before anything reads PERSONAS or seeds demo data, so a reload
// mid-session keeps the personalization from the first visit.
applyStoredLeadToPersona();

/** Skipping still marks the gate as decided, so the prompt only shows once per session. */
export async function submitDemoLead(lead: DemoLead | null, role: DemoRole, source: string) {
  try { storage()?.setItem(GATE_KEY, '1'); } catch { /* best effort */ }
  if (!lead) return;
  try { storage()?.setItem(LEAD_KEY, JSON.stringify(lead)); } catch { /* best effort */ }
  applyStoredLeadToPersona();
  try {
    await apiKeyClient().mutations.captureDemoLead({
      name: lead.name, email: lead.email, company: lead.company, role, source,
    });
  } catch {
    // The demo must never block on this; a missing or unreachable backend (e.g. local dev
    // with no sandbox deployed) is a normal case, not a failure worth surfacing.
  }
}
