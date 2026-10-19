import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoClient, resetDemoData } from './client';
import { setDemoRole, type DemoRole } from './mode';

const as = (role: DemoRole) => { setDemoRole(role); return createDemoClient(); };
const claimsFor = async (role: DemoRole) => (await as(role).models.Claim.list()).data.map((c: any) => c.claimNumber);

beforeEach(() => { resetDemoData(); setDemoRole(null); });

describe('demo visibility', () => {
  it('shows a client only their own records and no staff-only data', async () => {
    expect(await claimsFor('client')).toEqual(expect.arrayContaining(['CLM-20381', 'CLM-20402']));
    expect(await claimsFor('client')).not.toContain('CLM-20415');
    expect((await as('client').models.ClaimInternalNote.list()).data).toEqual([]);
    expect((await as('client').models.ClaimAssessment.list()).data).toEqual([]);
  });

  it('limits junior officers to assigned claims and gives seniors everything', async () => {
    const junior = await claimsFor('junior_officer');
    expect(junior).toEqual(expect.arrayContaining(['CLM-20402']));
    expect(junior).not.toContain('CLM-20381');
    expect((await claimsFor('senior_officer')).length).toBeGreaterThanOrEqual(5);
  });
});

describe('demo permissions', () => {
  it('rejects senior-only actions from other roles', async () => {
    for (const role of ['client', 'junior_officer', 'developer'] as DemoRole[]) {
      const result = await as(role).mutations.approveClaim({ claimId: 'clm-1', approvedPayout: 1 });
      expect(result.errors?.[0].message).toMatch(/senior|access/i);
    }
  });
});

describe('demo claim lifecycle', () => {
  it('moves a client claim through assessment, decision and payout', async () => {
    const client = as('client');
    const draft = await client.mutations.createClaimDraft({ policyId: 'pol-1', assetId: 'ast-1', policeCaseNumber: 'CAS 1', claimType: 'theft', description: 'Stolen overnight', incidentDate: new Date().toISOString() });
    const claimId = draft.data.id;
    expect((await client.mutations.submitClaimDraft({ claimId })).errors?.[0].message).toMatch(/affidavit/i);
    await client.mutations.registerClaimDocument({ claimId, fileName: 'a.pdf', mediaType: 'application/pdf', byteSize: 10, category: 'AFFIDAVIT' });
    const submitted = await client.mutations.submitClaimDraft({ claimId });
    expect(submitted.data.status).toBe('VALIDATING');
    expect(await claimsFor('junior_officer')).toContain(submitted.data.claimNumber);

    const junior = as('junior_officer');
    expect((await junior.mutations.startClaimProcessing({ claimId })).data.status).toBe('UNDER_ASSESSMENT');
    const assessment = await junior.mutations.calculateClaimPayoutAssessment({ claimId, coveredLossValue: 100000, policyLimit: 500000, excess: 5000, depreciation: 0.1 });
    expect(assessment.data.recommendedPayout).toBe(85000);
    expect((await junior.mutations.finalizeClaimPayoutAssessment({ assessmentId: assessment.data.id })).errors).toBeTruthy();

    const senior = as('senior_officer');
    await senior.mutations.finalizeClaimPayoutAssessment({ assessmentId: assessment.data.id });
    expect((await senior.mutations.approveClaim({ claimId, approvedPayout: 90000 })).errors?.[0].message).toMatch(/differs/i);
    expect((await senior.mutations.approveClaim({ claimId, approvedPayout: 85000 })).data.status).toBe('APPROVED');
  });

  it('issues, quotes and activates a policy application', async () => {
    const senior = as('senior_officer');
    await senior.mutations.reviewPolicyApplication({ applicationId: 'app-4', decision: 'UNDER_REVIEW' });
    expect((await senior.mutations.issuePolicyQuote({ applicationId: 'app-4', monthlyPremium: 9999 })).errors).toBeTruthy();
    const quoted = await senior.mutations.issuePolicyQuote({ applicationId: 'app-4', monthlyPremium: 1000, overrideReason: 'Security upgrades' });
    expect(quoted.data.status).toBe('QUOTED');
    const accepted = await as('client').mutations.acceptPolicyQuote({ applicationId: 'app-4' });
    expect(accepted.data.status).toBe('ACCEPTED');
    expect((await as('client').models.Policy.list()).data).toHaveLength(3);
  });
});

describe('demo coverage', () => {
  it('implements every mutation and query the pages call', () => {
    const files: string[] = [];
    const walk = (dir: string) => readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'demo') walk(path); } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) files.push(path);
    });
    walk('src');
    const used = { mutations: new Set<string>(), queries: new Set<string>() };
    files.forEach((file) => {
      for (const [, kind, name] of readFileSync(file, 'utf8').matchAll(/client\.(mutations|queries)\.(\w+)/g)) used[kind as 'mutations' | 'queries'].add(name);
    });
    const client = as('senior_officer');
    expect(used.mutations.size).toBeGreaterThan(20);
    used.queries.forEach((name) => expect(typeof client.queries[name]).toBe('function'));
    // Mutations are resolved lazily through a proxy, so an unknown name surfaces as a thrown TypeError.
    return Promise.all([...used.mutations].map(async (name) => {
      await expect(client.mutations[name]({})).resolves.toBeDefined();
    }));
  });
});

describe('demo isolation', () => {
  it('never creates the real Amplify client', async () => {
    const generateClient = vi.fn();
    vi.resetModules();
    vi.doMock('aws-amplify/data', () => ({ generateClient }));
    vi.doMock('aws-amplify/auth', () => ({ fetchAuthSession: vi.fn(), getCurrentUser: vi.fn() }));
    vi.doMock('aws-amplify/storage', () => ({ uploadData: vi.fn() }));
    // resetModules gives data.ts a fresh copy of mode.ts, so the role must be set on that copy.
    (await import('./mode')).setDemoRole('client');
    const data = await import('../data');
    expect(generateClient).not.toHaveBeenCalled();
    const portfolio = await data.loadPortfolio(['client']);
    expect(portfolio.claims.length).toBeGreaterThan(0);
    expect(portfolio.profile?.displayName).toBe('Thandi Mokoena');
  });
});
