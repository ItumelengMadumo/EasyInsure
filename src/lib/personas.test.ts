import { describe, expect, it } from 'vitest';
import { createPersonaPortfolio, personaByRole, personas, resolveRole } from './personas';

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
});
