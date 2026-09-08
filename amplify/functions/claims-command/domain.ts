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

export function validateDraftPrerequisites(
  policeCaseNumber: string | null | undefined,
  documents: Array<{ category?: string | null; status: string }>,
) {
  if (!policeCaseNumber?.trim() || policeCaseNumber.trim().length < 3) {
    return { valid: false, reason: 'A valid police case number is required' };
  }
  const affidavit = documents.some((document) =>
    document.category === 'AFFIDAVIT'
    && ['QUARANTINED', 'SCANNING', 'CLEAN', 'EXTRACTED'].includes(document.status));
  return affidavit
    ? { valid: true, reason: null }
    : { valid: false, reason: 'A police affidavit is required before submission' };
}
