export const claimTransitions: Readonly<Record<string, readonly string[]>> = {
  SUBMITTED: ['ASSIGNMENT_PENDING'],
  ASSIGNMENT_PENDING: ['VALIDATING'],
  VALIDATING: ['UNDER_ASSESSMENT', 'INFO_NEEDED'],
  UNDER_ASSESSMENT: ['INFO_NEEDED', 'DECISION_PENDING'],
  INFO_NEEDED: ['UNDER_ASSESSMENT'],
  DECISION_PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['PAYMENT_PENDING'],
  PAYMENT_PENDING: ['PAID'],
  PAID: ['CLOSED'],
  REJECTED: ['CLOSED'],
  FAILED: ['VALIDATING'],
};

export function canTransition(from: string, to: string) {
  return claimTransitions[from]?.includes(to) ?? false;
}

// Financial outcomes have dedicated, audited commands (approveClaim/rejectClaim and,
// later, a confirmed payout). The generic transitionClaim may never reach them.
const decisionTargets = ['APPROVED', 'REJECTED', 'PAID'];
export function canManuallyTransition(from: string, to: string) {
  return canTransition(from, to) && !decisionTargets.includes(to);
}

// Senior officers approve up to this amount; anything larger needs a superuser.
export const SENIOR_APPROVAL_LIMIT = 250_000;

export function assertDecisionAuthority(input: {
  actorSubject: string;
  actorGroups: string[];
  claimOwner: string;
  payout: number;
  assessment?: { assessorSubject?: string | null; finalizedBySubject?: string | null; policyLimit?: number | null } | null;
}) {
  const { actorSubject, actorGroups, claimOwner, payout, assessment } = input;
  if (actorSubject === claimOwner) throw new Error('You cannot decide a claim you own');
  if (!assessment) throw new Error('A finalized payout assessment is required before a decision');
  if (assessment.assessorSubject === actorSubject) throw new Error('The assessor of a claim cannot also decide it');
  if (assessment.finalizedBySubject === actorSubject) throw new Error('The officer who finalized the assessment cannot also decide it');
  if (typeof assessment.policyLimit === 'number' && payout > assessment.policyLimit) {
    throw new Error('The payout cannot exceed the policy limit');
  }
  if (payout > SENIOR_APPROVAL_LIMIT && !actorGroups.includes('superuser')) {
    throw new Error(`Payouts above R${SENIOR_APPROVAL_LIMIT.toLocaleString('en-ZA')} require superuser approval`);
  }
}

// Upload keys are `quarantine/{identityId}/{claimId}/{file}` for claims and
// `quarantine/{identityId}/applications/{applicationId}/{file}` for underwriting.
export function parseQuarantineKey(objectKey: string):
  { identityId: string; kind: 'claim' | 'application'; parentId: string; fileName: string } | null {
  if (!objectKey.startsWith('quarantine/') || objectKey.includes('..')) return null;
  const segments = objectKey.slice('quarantine/'.length).split('/');
  if (segments.some((segment) => !segment)) return null;
  if (segments[1] === 'applications') {
    if (segments.length !== 4) return null;
    return { identityId: segments[0], kind: 'application', parentId: segments[2], fileName: segments[3] };
  }
  if (segments.length !== 3) return null;
  return { identityId: segments[0], kind: 'claim', parentId: segments[1], fileName: segments[2] };
}

export const ALLOWED_MEDIA_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

// Checks the file's leading bytes rather than trusting the client-declared content type.
export function matchesFileSignature(bytes: Uint8Array, mediaType: string) {
  const starts = (signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  if (mediaType === 'application/pdf') return starts([0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (mediaType === 'image/jpeg') return starts([0xff, 0xd8, 0xff]);
  if (mediaType === 'image/png') return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return false;
}

export function sanitizeFileName(name: string) {
  const cleaned = name.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-120);
  return cleaned || 'document';
}

// AppSync serialises `AWSJSON` (a.json()) mutation arguments as a JSON string.
// The Amplify custom-operation client does not stringify object-valued arguments
// for us, so callers send a string and the resolver must parse it back before
// use. Already-parsed objects pass straight through for direct/Lambda callers.
export function coerceJsonObject(value: unknown, field = 'answers'): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); }
    catch { throw new Error(`${field} must be valid JSON`); }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${field} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

// The v6 Amplify Data client authorises AppSync with the Cognito access token,
// which carries `sub` and `cognito:groups` but not `email`/`name`. Resolver
// identity therefore cannot see a human email or name; the authenticated client
// passes them explicitly. Precedence: verified token claim, then client-supplied
// attribute, then a non-routable placeholder derived from the subject.
export function resolveProfileIdentity(input: {
  claims?: Record<string, unknown>;
  email?: unknown;
  displayName?: unknown;
  subject: string;
}): { email: string; displayName: string } {
  const claims = input.claims ?? {};
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const localPart = (value: string) => (value.includes('@') ? value.slice(0, value.indexOf('@')) : '');
  const isRealEmail = (value: string) =>
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) && !value.toLowerCase().endsWith('@profile.invalid');

  const claimEmail = text(claims.email);
  const argEmail = text(input.email);
  const email = isRealEmail(claimEmail) ? claimEmail
    : isRealEmail(argEmail) ? argEmail
    : `${input.subject}@profile.invalid`;

  const displayName = text(claims.name) || text(claims.preferred_username) || text(input.displayName)
    || (isRealEmail(claimEmail) ? localPart(claimEmail) : '')
    || (isRealEmail(argEmail) ? localPart(argEmail) : '')
    || input.subject;

  return { email, displayName };
}

// A draft may be lodged while its affidavit is still being scanned (status is only
// ever set server-side now). Assessment itself requires CLEAN evidence.
export const ACCEPTED_DOCUMENT_STATES = ['QUARANTINED', 'SCANNING', 'CLEAN', 'EXTRACTED'];

export function validateDraftPrerequisites(
  policeCaseNumber: string | null | undefined,
  documents: Array<{ category?: string | null; status: string }>,
) {
  if (!policeCaseNumber?.trim() || policeCaseNumber.trim().length < 3) {
    return { valid: false, reason: 'A valid police case number is required' };
  }
  const affidavit = documents.some((document) =>
    document.category === 'AFFIDAVIT'
    && ACCEPTED_DOCUMENT_STATES.includes(document.status));
  return affidavit
    ? { valid: true, reason: null }
    : { valid: false, reason: 'A police affidavit is required before submission' };
}
