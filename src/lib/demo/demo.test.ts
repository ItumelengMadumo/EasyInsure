import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoClient, resetDemoData } from './client';
import { setDemoRole, type DemoRole } from './mode';
import { POLICY_WORDING_VERSION } from './rules';

// The demo role is one global, so each helper call re-asserts its role: a client created for one
// role stays that role even after another is created (as when a test holds two at once).
const bind = (role: DemoRole, target: any): any => new Proxy(target, {
  get(object, key) {
    const value = object[key];
    if (typeof value === 'function') return (...args: unknown[]) => { setDemoRole(role); return value(...args); };
    return value && typeof value === 'object' ? bind(role, value) : value;
  },
});
const as = (role: DemoRole) => bind(role, createDemoClient());
const claimsFor = async (role: DemoRole) => (await as(role).models.Claim.list()).data.map((c: any) => c.claimNumber);
const message = (result: any) => result.errors?.[0]?.message as string | undefined;

beforeEach(() => { resetDemoData(); setDemoRole(null); });

describe('demo visibility', () => {
  it('shows a client only their own records and no staff-only data', async () => {
    expect(await claimsFor('client')).toEqual(expect.arrayContaining(['CLM-20381', 'CLM-20402']));
    expect(await claimsFor('client')).not.toContain('CLM-20415');
    expect((await as('client').models.ClaimInternalNote.list()).data).toEqual([]);
    expect((await as('client').models.ClaimAssessment.list()).data).toEqual([]);
    expect((await as('client').models.ClaimAnalysis.list()).data).toEqual([]);
  });

  it('hides staff-only timeline entries from the client', async () => {
    const activities = (await as('client').models.ClaimActivity.list()).data;
    expect(activities.length).toBeGreaterThan(0);
    expect(activities.every((item: any) => item.visibility === 'CLIENT_VISIBLE')).toBe(true);
    const staffView = (await as('senior_officer').models.ClaimActivity.list()).data;
    expect(staffView.some((item: any) => item.visibility === 'INTERNAL')).toBe(true);
  });

  it('limits junior officers to assigned claims and gives seniors everything', async () => {
    const junior = await claimsFor('junior_officer');
    expect(junior).toEqual(expect.arrayContaining(['CLM-20402']));
    expect(junior).not.toContain('CLM-20381');
    expect((await claimsFor('senior_officer')).length).toBeGreaterThanOrEqual(6);
  });

  it('gives officers their clients names without exposing other profiles', async () => {
    const junior = as('junior_officer');
    expect((await junior.models.UserProfile.list()).data).toHaveLength(1);
    const portfolio = (await junior.queries.getAssignedCasePortfolio({})).data;
    expect(portfolio.clientProfiles.map((p: any) => p.displayName)).toEqual(expect.arrayContaining(['Thandi Mokoena', 'Pieter van der Merwe']));
    expect(portfolio.clientProfiles.every((p: any) => p.email === '')).toBe(true);
  });

  it('gives the developer workflow state only, never client identity or narrative', async () => {
    const developer = as('developer');
    const portfolio = (await developer.queries.getAssignedCasePortfolio({})).data;
    expect(portfolio.claims.length).toBeGreaterThanOrEqual(6);
    expect(portfolio.claims.every((c: any) => c.owner === 'redacted' && c.description === 'Redacted for diagnostics')).toBe(true);
    expect(portfolio.documents).toEqual([]);
    expect(portfolio.communications).toEqual([]);
    expect(portfolio.jobs.length).toBeGreaterThan(0);
    expect((await developer.models.Claim.list()).data).toEqual([]);
  });

  it('only lets seniors read claim analyses', async () => {
    expect((await as('senior_officer').models.ClaimAnalysis.list()).data.length).toBeGreaterThan(0);
    expect((await as('junior_officer').models.ClaimAnalysis.list()).data).toEqual([]);
  });
});

describe('demo permissions', () => {
  it('rejects senior-only actions from other roles', async () => {
    for (const role of ['client', 'junior_officer', 'developer'] as DemoRole[]) {
      const result = await as(role).mutations.approveClaim({ claimId: 'clm-1', approvedPayout: 83200 });
      expect(message(result)).toMatch(/senior|access/i);
    }
  });

  it('stops staff closing their own account', async () => {
    expect(message(await as('junior_officer').mutations.requestAccountClosure({}))).toMatch(/administrator/);
    expect((await as('client').mutations.requestAccountClosure({})).errors).toBeUndefined();
  });
});

describe('decision authority', () => {
  it('lets the supervising senior decide a claim they did not assess or finalise', async () => {
    const approved = await as('senior_officer').mutations.approveClaim({ claimId: 'clm-1', approvedPayout: 83200 });
    expect(approved.data.status).toBe('APPROVED');
  });

  it('stops the officer who finalised an assessment from deciding the claim', async () => {
    expect(message(await as('superuser').mutations.approveClaim({ claimId: 'clm-1', approvedPayout: 83200 }))).toMatch(/finalized/i);
  });

  it('requires a reason when the payout differs from the assessment', async () => {
    expect(message(await as('senior_officer').mutations.approveClaim({ claimId: 'clm-1', approvedPayout: 80000 }))).toMatch(/override reason/i);
    const ok = await as('senior_officer').mutations.approveClaim({ claimId: 'clm-1', approvedPayout: 80000, overrideReason: 'Prior damage on the bumper' });
    expect(ok.data.status).toBe('APPROVED');
  });

  it('sends payouts above R250,000 to a superuser', async () => {
    expect(message(await as('senior_officer').mutations.approveClaim({ claimId: 'clm-6', approvedPayout: 340000 }))).toMatch(/superuser/i);
    expect((await as('superuser').mutations.approveClaim({ claimId: 'clm-6', approvedPayout: 340000 })).data.status).toBe('APPROVED');
  });

  it('does not let an officer decide', async () => {
    expect(message(await as('intermediate_officer').mutations.rejectClaim({ claimId: 'clm-1', reason: 'Not covered' }))).toMatch(/senior/i);
  });
});

describe('demo claim lifecycle', () => {
  it('moves a client claim from submission through the officer hand-off to a decision and payout', async () => {
    const client = as('client');
    const draft = await client.mutations.createClaimDraft({ policyId: 'pol-1', assetId: 'ast-1', policeCaseNumber: 'CAS 1', claimType: 'theft', description: 'Stolen overnight', incidentDate: new Date().toISOString() });
    const claimId = draft.data.id;
    expect(message(await client.mutations.submitClaimDraft({ claimId }))).toMatch(/affidavit/i);
    await client.mutations.registerClaimDocument({ claimId, fileName: 'a.pdf', mediaType: 'application/pdf', byteSize: 10, category: 'AFFIDAVIT' });
    const submitted = await client.mutations.submitClaimDraft({ claimId });
    expect(submitted.data.status).toBe('VALIDATING');
    expect(await claimsFor('junior_officer')).toContain(submitted.data.claimNumber);

    const junior = as('junior_officer');
    expect((await junior.mutations.startClaimProcessing({ claimId })).data.status).toBe('UNDER_ASSESSMENT');
    const evidence = (await junior.models.ClaimDocument.list()).data.filter((d: any) => d.claimId === claimId).map((d: any) => d.id);
    expect(message(await junior.mutations.calculateClaimPayoutAssessment({ claimId, evidenceReviewed: [], coveredLossValue: 1, policyLimit: 1, excess: 0, depreciation: 0 }))).toMatch(/clean claim evidence/i);
    const assessment = await junior.mutations.calculateClaimPayoutAssessment({ claimId, evidenceReviewed: evidence, coveredLossValue: 100000, policyLimit: 500000, excess: 5000, depreciation: 0.1 });
    expect(assessment.data.recommendedPayout).toBe(85000);
    expect(message(await junior.mutations.finalizeClaimPayoutAssessment({ assessmentId: assessment.data.id }))).toBeTruthy();

    // The officer hands the draft to a senior, who finalises it.
    expect((await junior.mutations.submitClaimAssessment({ assessmentId: assessment.data.id, note: 'Evidence is complete' })).data.status).toBe('SUBMITTED');
    const senior = as('senior_officer');
    expect((await senior.mutations.finalizeClaimPayoutAssessment({ assessmentId: assessment.data.id })).data.status).toBe('FINALIZED');

    // The finaliser cannot decide their own finalisation; the superuser can.
    expect(message(await senior.mutations.approveClaim({ claimId, approvedPayout: 85000 }))).toMatch(/finalized/i);
    const superuser = as('superuser');
    expect(message(await superuser.mutations.approveClaim({ claimId, approvedPayout: 90000 }))).toMatch(/override reason/i);
    expect((await superuser.mutations.approveClaim({ claimId, approvedPayout: 85000 })).data.status).toBe('APPROVED');
    expect((await junior.mutations.transitionClaim({ claimId, targetStatus: 'PAYMENT_PENDING', summary: 'Preparing payment' })).data.status).toBe('PAYMENT_PENDING');

    // Only a senior records the payout, and only for the approved amount.
    expect(message(await junior.mutations.recordClaimPayout({ claimId, paidAmount: 85000, paymentReference: 'EFT-1234' }))).toMatch(/senior/i);
    expect(message(await senior.mutations.recordClaimPayout({ claimId, paidAmount: 1, paymentReference: 'EFT-1234' }))).toMatch(/approved payout/i);
    expect((await senior.mutations.recordClaimPayout({ claimId, paidAmount: 85000, paymentReference: 'EFT-1234' })).data.status).toBe('PAID');
  });

  it('lets only the officer who prepared an assessment send it for review', async () => {
    const intermediate = as('intermediate_officer');
    const evidence = (await intermediate.models.ClaimDocument.list()).data.filter((d: any) => d.claimId === 'clm-3').map((d: any) => d.id);
    const draft = await intermediate.mutations.calculateClaimPayoutAssessment({ claimId: 'clm-3', evidenceReviewed: evidence, coveredLossValue: 150000, policyLimit: 215000, excess: 4000, depreciation: 0.2 });
    expect(draft.data.status).toBe('DRAFT');
    expect(message(await as('junior_officer').mutations.submitClaimAssessment({ assessmentId: draft.data.id }))).toBeTruthy();
    expect((await intermediate.mutations.submitClaimAssessment({ assessmentId: draft.data.id })).data.status).toBe('SUBMITTED');
  });

  it('issues a quote with terms and activates the policy only on the agreed wording', async () => {
    const senior = as('senior_officer');
    await senior.mutations.reviewPolicyApplication({ applicationId: 'app-4', decision: 'UNDER_REVIEW' });
    expect(message(await senior.mutations.issuePolicyQuote({ applicationId: 'app-4', monthlyPremium: 9999, excess: 5000, coverLimit: 1850000 }))).toMatch(/override reason|outside/i);
    expect(message(await senior.mutations.issuePolicyQuote({ applicationId: 'app-4', monthlyPremium: 1760 }))).toMatch(/excess/i);
    const quoted = await senior.mutations.issuePolicyQuote({ applicationId: 'app-4', monthlyPremium: 1760, excess: 10000, coverLimit: 1850000, exclusions: ['Flood damage'] });
    expect(quoted.data.quoteTerms).toEqual({ excess: 10000, coverLimit: 1850000, exclusions: ['Flood damage'], wordingVersion: POLICY_WORDING_VERSION });

    const client = as('client');
    expect(message(await client.mutations.acceptPolicyQuote({ applicationId: 'app-4', acceptedWordingVersion: 'old' }))).toMatch(/wording/i);
    const accepted = await client.mutations.acceptPolicyQuote({ applicationId: 'app-4', acceptedWordingVersion: POLICY_WORDING_VERSION });
    expect(accepted.data.status).toBe('ACCEPTED');
    const policies = (await client.models.Policy.list()).data;
    expect(policies).toHaveLength(3);
    expect(policies.find((p: any) => p.excess === 10000)?.exclusions).toEqual(['Flood damage']);
  });

  it('accepts phone photos and videos as evidence but rejects other file types', async () => {
    const client = as('client');
    for (const mediaType of ['image/heic', 'video/mp4']) {
      expect((await client.mutations.registerClaimDocument({ claimId: 'clm-2', fileName: 'x', mediaType, byteSize: 1000, category: 'INCIDENT_EVIDENCE' })).errors).toBeUndefined();
    }
    expect(message(await client.mutations.registerClaimDocument({ claimId: 'clm-2', fileName: 'x.exe', mediaType: 'application/x-msdownload', byteSize: 10, category: 'OTHER' }))).toMatch(/Files must be/);
    expect(message(await client.mutations.registerClaimDocument({ claimId: 'clm-2', fileName: 'big.pdf', mediaType: 'application/pdf', byteSize: 11 * 1024 * 1024, category: 'OTHER' }))).toMatch(/10 MB/);
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
    expect(portfolio.applications.find((a: any) => a.status === 'QUOTED')?.quoteTerms?.wordingVersion).toBe(POLICY_WORDING_VERSION);
  });

  it('loads a complete portfolio for every role without errors', async () => {
    const roles: [DemoRole, string[]][] = [['client', ['client']], ['junior_officer', ['junior_officer']], ['developer', ['developer']], ['senior_officer', ['senior_officer']], ['superuser', ['superuser']]];
    for (const [role, groups] of roles) {
      vi.resetModules();
      vi.doMock('aws-amplify/data', () => ({ generateClient: vi.fn() }));
      vi.doMock('aws-amplify/auth', () => ({ fetchAuthSession: vi.fn(), getCurrentUser: vi.fn() }));
      vi.doMock('aws-amplify/storage', () => ({ uploadData: vi.fn() }));
      (await import('./mode')).setDemoRole(role);
      const portfolio = await (await import('../data')).loadPortfolio(groups);
      expect(portfolio.profile, role).toBeTruthy();
      if (role === 'senior_officer') { expect(portfolio.analyses.length).toBeGreaterThan(0); expect(portfolio.analyses[0].deterministicOutputs?.fraud?.signals.length).toBeGreaterThan(0); }
      if (role === 'developer') expect(portfolio.jobs.length).toBeGreaterThan(0);
    }
  });
});
