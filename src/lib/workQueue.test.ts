import { describe, expect, it } from 'vitest';
import { clientStatus, coverState, riskLevel, trackerPosition, waitingOnClient } from './status';
import { roleFlags } from './roles';
import { buildWorkQueue } from './workQueue';
import { copyFor } from './copy';
import { dateTime } from './format';
import { toCsv } from './csv';
import type { Claim, Portfolio } from '../types';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const day = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
const claim = (id: string, status: string, extra: Partial<Claim> = {}): Claim => ({
  id, owner: 'client-1', claimNumber: `CLM-${id}`, policyId: 'p', assetId: 'a', claimType: 'theft', incidentDate: day(10), status, submittedAt: day(8), lastActivityAt: day(2), ...extra,
});
const base: Portfolio = { assets: [], policies: [], applications: [], premiumAssessments: [], claims: [], documents: [], assignments: [], activities: [], communications: [], internalNotes: [], claimAssessments: [], analyses: [], jobs: [], profiles: [], profile: null };
const assessment = (claimId: string, status: string, assessor = 'officer-1', finalizer?: string) => ({
  id: `as-${claimId}`, claimId, version: 1, evidenceReviewed: [], coveredLossValue: 1, policyLimit: 1, excess: 0, depreciation: 0, exclusions: [], recommendedPayout: 1, status, assessorSubject: assessor, finalizedBySubject: finalizer,
});

describe('roleFlags', () => {
  it('describes every group once', () => {
    expect(roleFlags(['client'])).toMatchObject({ isClient: true, isStaff: false, canOperate: false });
    expect(roleFlags(['junior_officer'])).toMatchObject({ isStaff: true, isSenior: false, canOperate: true });
    expect(roleFlags(['senior_officer'])).toMatchObject({ isSenior: true, isSuperuser: false });
    expect(roleFlags(['superuser'])).toMatchObject({ isSenior: true, isSuperuser: true });
    expect(roleFlags(['developer'])).toMatchObject({ isStaff: true, isDeveloper: true, canOperate: false });
    expect(roleFlags([])).toMatchObject({ isClient: true });
  });
});

describe('status wording', () => {
  it('never shows a client internal vocabulary', () => {
    expect(clientStatus('INFO_NEEDED').label).toBe('Waiting on you');
    expect(clientStatus('ASSIGNMENT_PENDING').label).toBe('Received');
    expect(waitingOnClient('INFO_NEEDED')).toBe(true);
    expect(copyFor(roleFlags(['client'])).claimFilters.map((item) => item.label)).not.toContain('Unassigned');
  });

  it('keeps the tracker consistent with the badge', () => {
    expect(trackerPosition('INFO_NEEDED', ['SUBMITTED'])).toBe(2);
    expect(trackerPosition('PAID')).toBe(6);
    expect(trackerPosition('UNDER_ASSESSMENT', ['SUBMITTED', 'VALIDATING', 'UNDER_ASSESSMENT'])).toBe(2);
  });

  it('answers "is it covered?" the same way everywhere', () => {
    expect(coverState({ policyId: 'p', status: 'INSURABLE' }, { status: 'ACCEPTED' })).toBe('COVERED');
    expect(coverState({ policyId: null, status: 'UNDER_REVIEW' }, { status: 'QUOTED' })).toBe('QUOTE_READY');
    expect(coverState({ policyId: null, status: 'UNDER_REVIEW' }, { status: 'SUBMITTED' })).toBe('SUBMITTED');
    expect(coverState({ policyId: null, status: 'DECLINED' }, null)).toBe('DECLINED');
  });

  it('uses the engine risk thresholds', () => {
    expect([0.1, 0.3, 0.8, 1.4].map(riskLevel)).toEqual(['low', 'medium', 'high', 'critical']);
  });
});

describe('formatting and export', () => {
  it('formats date and time one way', () => { expect(dateTime('2026-10-15T11:25:00Z')).toMatch(/15 Oct 2026/); });
  it('neutralises spreadsheet formulas and quotes awkward cells', () => {
    expect(toCsv([['=SUM(A1)', 'a,b', 'say "hi"']])).toBe('\'=SUM(A1),"a,b","say ""hi"""');
  });
});

describe('work queue', () => {
  const junior = roleFlags(['junior_officer']);
  const senior = roleFlags(['senior_officer']);

  it('tells an officer what to do for each of their cases and flags overdue work', () => {
    const portfolio: Portfolio = { ...base, claims: [
      claim('1', 'VALIDATING'), claim('2', 'UNDER_ASSESSMENT'), claim('3', 'UNDER_ASSESSMENT', { lastActivityAt: day(9) }), claim('4', 'INFO_NEEDED', { lastActivityAt: day(6) }), claim('5', 'INFO_NEEDED', { lastActivityAt: day(1) }),
    ], claimAssessments: [assessment('3', 'DRAFT')] };
    const queue = buildWorkQueue(portfolio, junior, 'officer-1', NOW);
    expect(queue.items.map((item) => item.action)).toEqual(expect.arrayContaining(['Start the assessment', 'Prepare a payout assessment', 'Send your assessment for senior review', 'Chase the client']));
    expect(queue.items.filter((item) => item.claim?.id === '5')).toHaveLength(0);
    expect(queue.items[0].overdue).toBe(true);
    expect(queue.waitingOnClient).toBe(2);
    expect(queue.open).toBe(5);
  });

  it('gives seniors the review work but never a claim they assessed or finalised', () => {
    const portfolio: Portfolio = { ...base, claims: [claim('1', 'DECISION_PENDING'), claim('2', 'DECISION_PENDING'), claim('3', 'UNDER_ASSESSMENT')],
      claimAssessments: [assessment('1', 'FINALIZED', 'officer-1', 'senior-2'), assessment('2', 'FINALIZED', 'officer-1', 'me'), assessment('3', 'SUBMITTED')] };
    const actions = buildWorkQueue(portfolio, senior, 'me', NOW).items.map((item) => `${item.claim?.id}:${item.action}`);
    expect(actions).toContain('1:Decide the claim');
    expect(actions).not.toContain('2:Decide the claim');
    expect(actions).toContain('3:Finalise the submitted assessment');
  });

  it('gives clients and developers no work items', () => {
    const portfolio: Portfolio = { ...base, claims: [claim('1', 'VALIDATING')] };
    expect(buildWorkQueue(portfolio, roleFlags(['client']), 'c', NOW).items).toEqual([]);
    expect(buildWorkQueue(portfolio, roleFlags(['developer']), 'd', NOW).items).toEqual([]);
  });
});
