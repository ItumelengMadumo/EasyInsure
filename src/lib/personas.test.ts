import { describe, expect, it } from 'vitest';
import { capabilitiesFor, createPersonaPortfolio, createScenarioPortfolio, personaByRole, personas, resolveRole, scenarioCatalogue } from './personas';

describe('persona workflow lab', () => {
  it('defines every supported business persona', () => {
    expect(personas.map((persona) => persona.role)).toEqual([
      'client', 'junior_officer', 'intermediate_officer', 'senior_officer', 'developer', 'superuser',
    ]);
  });

  it('fails closed for missing, multiple, or mismatched identities', () => {
    expect(resolveRole([], null).role).toBeNull();
    expect(resolveRole(['developer', 'superuser'], null).role).toBeNull();
    expect(resolveRole(['developer'], 'senior_officer').role).toBeNull();
    expect(resolveRole(['developer'], 'developer')).toEqual({ role: 'developer', conflict: '' });
  });

  it('keeps client preview records private and staff-only records out', () => {
    const client = createPersonaPortfolio('client');
    expect(client.claims.length).toBeGreaterThan(0);
    expect(client.internalNotes).toEqual([]);
    expect(client.claimAssessments).toEqual([]);
  });

  it('gives decision personas complete synthetic oversight data', () => {
    const senior = createPersonaPortfolio('senior_officer');
    expect(senior.claims.some((claim) => claim.status === 'ASSIGNMENT_PENDING')).toBe(true);
    expect(senior.claims.some((claim) => claim.status === 'DECISION_PENDING')).toBe(true);
    expect(senior.communications.some((message) => message.deliveryState === 'FAILED')).toBe(true);
    expect(senior.claimAssessments).toHaveLength(1);
    expect(personaByRole('developer').forbidden).toContain('Approve payouts');
  });

  it('centralizes role capabilities and exposes the full scenario catalogue', () => {
    expect(capabilitiesFor('developer').canDecideClaims).toBe(false);
    expect(capabilitiesFor('developer').canViewAllClaims).toBe(true);
    expect(capabilitiesFor('senior_officer').canDecideClaims).toBe(true);
    expect(capabilitiesFor('client').visiblePages).not.toContain('review');
    expect(scenarioCatalogue).toHaveLength(19);
  });

  it('creates deterministic focused scenarios without leaking internal client records', () => {
    const empty = createScenarioPortfolio('client', 'empty-client');
    expect(empty.assets).toEqual([]);
    const closed = createScenarioPortfolio('client', 'closed-claim');
    expect(closed.claims).toHaveLength(1);
    expect(closed.claims[0].status).toBe('CLOSED');
    expect(closed.internalNotes).toEqual([]);
  });
});
