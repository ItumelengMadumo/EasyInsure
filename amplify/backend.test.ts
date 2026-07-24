import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BEDROCK_INFERENCE_PROFILE_ID,
  BEDROCK_REGION,
  DATA_REGION,
} from './config/regions';
import { buildInferencePayload, redactText } from './functions/claims-copilot/privacy';
import { canTransition, validateDraftPrerequisites } from './functions/claims-command/domain';
import { calculatePremium, calculateRecommendedPayout, validateApplication } from './functions/claims-command/underwriting';

describe('regional deployment boundary', () => {
  it('keeps the application data plane and Bedrock endpoint in us-east-1', () => {
    expect(DATA_REGION).toBe('us-east-1');
    expect(BEDROCK_REGION).toBe('us-east-1');
    expect(BEDROCK_INFERENCE_PROFILE_ID.startsWith('us.')).toBe(true);
  });

  it('does not configure S3 replication', () => {
    const backend = readFileSync('amplify/backend.ts', 'utf8');
    expect(backend).toContain('cfnBucket.replicationConfiguration = undefined');
    expect(backend).not.toMatch(/replicationConfiguration\s*=\s*\{/);
  });

  it('keeps workflow execution payloads out of CloudWatch logs', () => {
    const backend = readFileSync('amplify/backend.ts', 'utf8');
    expect(backend).toContain('includeExecutionData: false');
  });

  it('does not overlap read-only and senior model authorization directives', () => {
    const dataSchema = readFileSync('amplify/data/resource.ts', 'utf8');
    expect(dataSchema).toContain("const senior = ['senior_officer', 'superuser']");
    expect(dataSchema).not.toContain("allow.groups(['superuser']).to(['read']),\n    allow.groups(senior).to(['read'])");
  });

  it('keeps developer diagnostics separate from financial authority', () => {
    const auth = readFileSync('amplify/auth/resource.ts', 'utf8');
    const commands = readFileSync('amplify/functions/claims-command/handler.ts', 'utf8');
    expect(auth).toContain("'developer'");
    expect(commands).toContain("function isDeveloper(actor: Actor)");
    expect(commands).toContain("if (!isStaff(actor) || isDeveloper(actor))");
    expect(commands).not.toContain("const seniorGroups = ['senior_officer', 'developer'");
  });
});

describe('Bedrock minimization', () => {
  it('redacts common South African identifiers', () => {
    const value = redactText('Email me@site.co.za, call +27 82 123 4567, ID 9001015009087', 1_000);
    expect(value).not.toContain('me@site.co.za');
    expect(value).not.toContain('+27 82 123 4567');
    expect(value).not.toContain('9001015009087');
  });

  it('allowlists claim fields before model inference', () => {
    const payload = buildInferencePayload({
      owner: 'cognito-sub', policyId: 'private-policy', claimType: 'vehicle',
      description: 'Collision',
    }, { risk: 'low' }, 'evidence');
    expect(payload.claim).not.toHaveProperty('owner');
    expect(payload.claim).not.toHaveProperty('policyId');
    expect(payload.claim.claimType).toBe('vehicle');
  });
});

describe('asset underwriting and evidence-based payouts', () => {
  it('requires category-specific answers and underwriting consent', () => {
    const missing = validateApplication('vehicle', { description: 'Family vehicle' });
    expect(missing).toContain('VIN');
    expect(missing).toContain('I consent to these declarations being used for underwriting');
  });

  it('produces a deterministic indicative range with explainable factors', () => {
    const first = calculatePremium('vehicle', { purchasePrice: 350_000, priorClaims: 1, condition: 'average', assetUse: 'Personal', cancelledCover: false });
    const second = calculatePremium('vehicle', { purchasePrice: 350_000, priorClaims: 1, condition: 'average', assetUse: 'Personal', cancelledCover: false });
    expect(first).toEqual(second);
    expect(first.rangeLow).toBeLessThan(first.indicativePremium);
    expect(first.rangeHigh).toBeGreaterThan(first.indicativePremium);
    expect(first.factors.length).toBeGreaterThan(3);
  });

  it('bounds payout recommendations by evidence, limit, depreciation and excess', () => {
    expect(calculateRecommendedPayout({
      coveredLossValue: 100_000, repairEstimate: 80_000, replacementEstimate: 120_000,
      policyLimit: 70_000, depreciation: 0.1, excess: 5_000,
    })).toBe(65_000);
  });

  it('removes client-supplied payout amounts from claim commands', () => {
    const schema = readFileSync('amplify/data/resource.ts', 'utf8');
    const draftCommand = schema.slice(schema.indexOf('createClaimDraft:'), schema.indexOf('submitClaimDraft:'));
    expect(draftCommand).not.toContain('amountRequested');
    expect(schema).toContain('ClaimAssessment: a.model');
  });
});

describe('permanent claim case contract', () => {
  it('requires both a police case number and affidavit before submission', () => {
    expect(validateDraftPrerequisites('', [])).toEqual({
      valid: false, reason: 'A valid police case number is required',
    });
    expect(validateDraftPrerequisites('CAS 123/07/2026', [])).toEqual({
      valid: false, reason: 'A police affidavit is required before submission',
    });
    expect(validateDraftPrerequisites('CAS 123/07/2026', [
      { category: 'AFFIDAVIT', status: 'QUARANTINED' },
    ])).toEqual({ valid: true, reason: null });
  });

  it('enforces information loops and human decision milestones', () => {
    expect(canTransition('UNDER_ASSESSMENT', 'INFO_NEEDED')).toBe(true);
    expect(canTransition('INFO_NEEDED', 'UNDER_ASSESSMENT')).toBe(true);
    expect(canTransition('DECISION_PENDING', 'APPROVED')).toBe(true);
    expect(canTransition('UNDER_ASSESSMENT', 'PAID')).toBe(false);
  });

  it('keeps private notes outside owner-readable case ledgers', () => {
    const schema = readFileSync('amplify/data/resource.ts', 'utf8');
    const internalNote = schema.slice(schema.indexOf('ClaimInternalNote:'), schema.indexOf('ClaimCommunication:'));
    expect(internalNote).toContain('allow.groups(senior)');
    expect(internalNote).not.toContain('allow.ownerDefinedIn');
  });

  it('wires every external channel through the communication queue', () => {
    const worker = readFileSync('amplify/functions/communication-worker/handler.ts', 'utf8');
    expect(worker).toContain('EMAIL:');
    expect(worker).toContain('SMS:');
    expect(worker).toContain('WHATSAPP:');
    expect(worker).toContain("state: 'DISABLED'");
  });
});
