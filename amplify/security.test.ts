import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SENIOR_APPROVAL_LIMIT, assertDecisionAuthority, canManuallyTransition, matchesFileSignature,
  parseQuarantineKey, sanitizeFileName, validateDraftPrerequisites,
} from './functions/claims-command/domain';

const schema = readFileSync('amplify/data/resource.ts', 'utf8');
const model = (name: string, next: string) => schema.slice(schema.indexOf(`  ${name}: a.model(`), schema.indexOf(`  ${next}:`));

describe('model authorization: no raw writes to money, status or evidence', () => {
  it('gives clients no direct create on documents, so scan status cannot be forged', () => {
    expect(model('ClaimDocument', 'ClaimAssignment')).not.toContain("'create'");
    expect(model('ApplicationDocument', 'AssetValuation')).not.toContain("'create'");
    expect(schema).toContain('registerClaimDocument: a.mutation()');
    expect(schema).toContain('registerApplicationDocument: a.mutation()');
  });

  it('lets no group write claims, policies, assessments, notes or calls outside audited commands', () => {
    for (const [name, next] of [
      ['Claim', 'ClaimDocument'], ['Policy', 'Claim'], ['PolicyApplication', 'PremiumAssessment'],
      ['ClaimAssessment', 'AuditEvent'], ['ClaimInternalNote', 'ClaimCommunication'], ['CallRecord', 'InboundReconciliation'],
      ['ClaimAssignment', 'ClaimActivity'], ['AssetValuation', 'Policy'], ['UnderwritingProfile', 'PolicyApplication'],
      ['AccountClosureRequest', 'ClaimAnalysis'], ['AssetDetail', 'UnderwritingProfile'],
    ]) {
      const block = model(name, next);
      expect(block.length, name).toBeGreaterThan(0);
      expect(block, name).not.toMatch(/allow\.groups\((senior|staff)\)(?!\.to\(\['read'\]\))/);
      expect(block, name).not.toMatch(/'create'|'update'|'delete'/);
    }
  });

  it('stops clients editing their own role or account status', () => {
    const profile = model('UserProfile', 'Asset');
    expect(profile).toContain("allow.ownerDefinedIn('owner').to(['read'])");
    expect(profile).not.toContain("'update'");
    expect(schema).toContain('updateMyProfile: a.mutation()');
  });

  it('keeps the Bedrock copilot away from developers and junior staff', () => {
    const copilot = schema.slice(schema.indexOf('generateClaimCopilot'));
    expect(copilot.slice(0, copilot.indexOf('.handler('))).toContain('allow.groups(senior)');
  });
});

describe('separation of duties and approval authority', () => {
  const base = {
    actorSubject: 'senior-b', actorGroups: ['senior_officer'], claimOwner: 'client', payout: 1000,
    assessment: { assessorSubject: 'junior-a', finalizedBySubject: 'senior-a', policyLimit: 50_000 },
  };

  it('allows an independent senior within limits', () => {
    expect(() => assertDecisionAuthority(base)).not.toThrow();
  });
  it('blocks deciding a claim you own', () => {
    expect(() => assertDecisionAuthority({ ...base, claimOwner: 'senior-b' })).toThrow(/own/);
  });
  it('blocks the assessor and the finalizer from deciding', () => {
    expect(() => assertDecisionAuthority({ ...base, actorSubject: 'junior-a' })).toThrow(/assessor/);
    expect(() => assertDecisionAuthority({ ...base, actorSubject: 'senior-a' })).toThrow(/finalized/);
  });
  it('requires a finalized assessment', () => {
    expect(() => assertDecisionAuthority({ ...base, assessment: null })).toThrow(/assessment/);
  });
  it('caps payouts at the policy limit and escalates large amounts to a superuser', () => {
    expect(() => assertDecisionAuthority({ ...base, payout: 60_000 })).toThrow(/policy limit/);
    const large = { ...base, payout: SENIOR_APPROVAL_LIMIT + 1, assessment: { ...base.assessment, policyLimit: 1_000_000 } };
    expect(() => assertDecisionAuthority(large)).toThrow(/superuser/);
    expect(() => assertDecisionAuthority({ ...large, actorGroups: ['superuser'] })).not.toThrow();
  });
  it('keeps approve, reject and paid out of the generic transition command', () => {
    expect(canManuallyTransition('DECISION_PENDING', 'APPROVED')).toBe(false);
    expect(canManuallyTransition('DECISION_PENDING', 'REJECTED')).toBe(false);
    expect(canManuallyTransition('PAYMENT_PENDING', 'PAID')).toBe(false);
    expect(canManuallyTransition('APPROVED', 'PAYMENT_PENDING')).toBe(true);
    expect(canManuallyTransition('PAID', 'CLOSED')).toBe(true);
  });
});

describe('evidence intake', () => {
  it('parses claim and application quarantine keys and rejects anything else', () => {
    expect(parseQuarantineKey('quarantine/us-east-1:abc/claim-1/f.pdf')).toEqual({ identityId: 'us-east-1:abc', kind: 'claim', parentId: 'claim-1', fileName: 'f.pdf' });
    expect(parseQuarantineKey('quarantine/id/applications/app-1/f.pdf')).toMatchObject({ kind: 'application', parentId: 'app-1' });
    expect(parseQuarantineKey('evidence/id/claim-1/f.pdf')).toBeNull();
    expect(parseQuarantineKey('quarantine/id/claim-1/../x.pdf')).toBeNull();
    expect(parseQuarantineKey('quarantine/id/claim-1/nested/f.pdf')).toBeNull();
  });
  it('checks real file signatures instead of the declared content type', () => {
    const text = (value: string) => new TextEncoder().encode(value);
    expect(matchesFileSignature(text('%PDF-1.7'), 'application/pdf')).toBe(true);
    expect(matchesFileSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).toBe(true);
    expect(matchesFileSignature(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), 'application/pdf')).toBe(false);
    expect(matchesFileSignature(text('%PDF-1.7'), 'image/png')).toBe(false);
  });
  it('sanitises uploaded file names', () => {
    expect(sanitizeFileName('../../etc/passwd')).not.toContain('/');
    expect(sanitizeFileName('Affidavit (signed).pdf')).toBe('Affidavit_signed_.pdf');
  });
  it('never treats a rejected upload as an affidavit', () => {
    expect(validateDraftPrerequisites('CAS 1/2026', [{ category: 'AFFIDAVIT', status: 'REJECTED' }]).valid).toBe(false);
  });
});

describe('concurrency and pagination guards in handlers', () => {
  const handler = readFileSync('amplify/functions/claims-command/handler.ts', 'utf8');
  it('uses conditional writes on every decision path', () => {
    for (const expected of ["}, 'DECISION_PENDING');", "}, 'UNDER_ASSESSMENT');", "}, 'PAYMENT_PENDING');", "}, 'QUOTED');", "}, 'DRAFT');", "}, 'ASSIGNMENT_PENDING');"]) {
      expect(handler).toContain(expected);
    }
  });
  it('never reads a single unpaginated page in background handlers', () => {
    expect(handler).not.toMatch(/client\.models\.\w+\.list\(/);
    expect(readFileSync('amplify/functions/assignment-worker/handler.ts', 'utf8')).not.toMatch(/data\.models\.\w+\.list\(/);
  });
  it('promotes evidence only after a GuardDuty verdict', () => {
    const scan = readFileSync('amplify/functions/scan-evidence/handler.ts', 'utf8');
    const backend = readFileSync('amplify/backend.ts', 'utf8');
    expect(scan).toContain("verdict === 'NO_THREATS_FOUND'");
    expect(backend).toContain('CfnMalwareProtectionPlan');
    expect(backend).toContain("addEnvironment('MALWARE_SCAN_MODE', 'guardduty')");
  });
});
