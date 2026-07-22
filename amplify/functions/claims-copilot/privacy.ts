const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?<!\d)(?:\+27[\s-]?|0)[1-8][0-9](?:[\s-]?\d){7}(?!\d)/g;
const SA_ID = /(?<!\d)\d{13}(?!\d)/g;
const MAX_DESCRIPTION_CHARS = 6_000;
const MAX_EVIDENCE_CHARS = 12_000;

export function redactText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(EMAIL, '[REDACTED_EMAIL]')
    .replace(PHONE, '[REDACTED_PHONE]')
    .replace(SA_ID, '[REDACTED_ID]')
    .slice(0, maxLength);
}

export function buildInferencePayload(
  claim: unknown,
  deterministicOutputs: unknown,
  evidenceText?: string,
) {
  const source = claim && typeof claim === 'object' ? claim as Record<string, unknown> : {};
  return {
    claim: {
      claimType: redactText(source.claimType, 120),
      description: redactText(source.description, MAX_DESCRIPTION_CHARS),
      incidentDate: source.incidentDate,
      amountRequested: source.amountRequested,
      tier: source.tier,
    },
    deterministicOutputs,
    evidenceText: redactText(evidenceText, MAX_EVIDENCE_CHARS),
  };
}
