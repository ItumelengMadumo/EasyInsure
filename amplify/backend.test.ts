import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BEDROCK_INFERENCE_PROFILE_ID,
  BEDROCK_REGION,
  DATA_REGION,
} from './config/regions';
import { buildInferencePayload, redactText } from './functions/claims-copilot/privacy';

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
    expect(dataSchema).toContain("const readOnlyStaff = ['junior_officer', 'intermediate_officer']");
    expect(dataSchema).toContain("const senior = ['senior_officer', 'superuser']");
    expect(dataSchema).not.toContain("allow.groups(['superuser']).to(['read']),\n    allow.groups(senior).to(['read'])");
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
      description: 'Collision', amountRequested: 10_000,
    }, { risk: 'low' }, 'evidence');
    expect(payload.claim).not.toHaveProperty('owner');
    expect(payload.claim).not.toHaveProperty('policyId');
    expect(payload.claim.claimType).toBe('vehicle');
  });
});
