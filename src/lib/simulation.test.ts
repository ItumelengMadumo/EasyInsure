import { describe, expect, it } from 'vitest';
import { createScenarioPortfolio } from './personas';
import { simulateCommand } from './simulation';

describe('workspace simulation adapter', () => {
  it('progresses an insurer-reviewed claim entirely in local portfolio state', () => {
    let portfolio = createScenarioPortfolio('intermediate_officer', 'claim-assessment');
    const claimId = portfolio.claims[0].id;
    let output = simulateCommand(portfolio, {
      kind: 'mutation', operation: 'calculateClaimPayoutAssessment',
      args: { claimId, evidenceReviewed: ['doc-1'], coveredLossValue: 50000, policyLimit: 45000, excess: 2500, depreciation: 0.1, exclusions: [] },
    }, 'intermediate_officer');
    portfolio = output.portfolio;
    expect(output.result.data.recommendedPayout).toBe(38000);
    const assessmentId = output.result.data.id;

    output = simulateCommand(portfolio, { kind: 'mutation', operation: 'finalizeClaimPayoutAssessment', args: { assessmentId } }, 'senior_officer');
    portfolio = output.portfolio;
    expect(portfolio.claims[0].status).toBe('DECISION_PENDING');
    expect(portfolio.claims[0].suggestedPayout).toBe(38000);

    output = simulateCommand(portfolio, { kind: 'mutation', operation: 'approveClaim', args: { claimId, approvedPayout: 38000 } }, 'senior_officer');
    expect(output.portfolio.claims[0].status).toBe('APPROVED');
    expect(output.portfolio.activities.at(-1)?.summary).toContain('approved');
  });

  it('simulates client-visible communication without modifying the input fixture', () => {
    const original = createScenarioPortfolio('client', 'closed-claim');
    const claimId = original.claims[0].id;
    const output = simulateCommand(original, {
      kind: 'mutation', operation: 'sendClaimCommunication',
      args: { claimId, channel: 'PORTAL', body: 'Please confirm the outcome.', subject: 'Case update' },
    }, 'client');
    expect(original.communications).toHaveLength(1);
    expect(output.portfolio.communications).toHaveLength(2);
    expect(output.portfolio.communications.at(-1)?.direction).toBe('INBOUND');
  });

  it('returns synthetic asset definitions instead of requiring a backend query', () => {
    const portfolio = createScenarioPortfolio('client', 'asset-application');
    const output = simulateCommand(portfolio, { kind: 'query', operation: 'getAssetCategoryDefinitions', args: {} }, 'client');
    expect(output.result.data.vehicle.fields.length).toBeGreaterThan(0);
  });
});
