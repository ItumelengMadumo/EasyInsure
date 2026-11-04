const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?<!\d)(?:\+27[\s-]?|0)[1-8][0-9](?:[\s-]?\d){7}(?!\d)/g;
const SA_ID = /(?<!\d)\d{13}(?!\d)/g;
const MAX_DESCRIPTION_CHARS = 6_000;
const MAX_EVIDENCE_CHARS_PER_DOCUMENT = 4_000;
const MAX_EVIDENCE_DOCUMENTS = 10;

export function redactText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(EMAIL, '[REDACTED_EMAIL]')
    .replace(PHONE, '[REDACTED_PHONE]')
    .replace(SA_ID, '[REDACTED_ID]')
    .slice(0, maxLength);
}

export type EvidenceDocument = { documentId: string; fileName: string; text: string };

export function buildInferencePayload(
  claim: unknown,
  deterministicOutputs: unknown,
  evidenceDocuments?: EvidenceDocument[],
) {
  const source = claim && typeof claim === 'object' ? claim as Record<string, unknown> : {};
  return {
    claim: {
      claimType: redactText(source.claimType, 120),
      description: redactText(source.description, MAX_DESCRIPTION_CHARS),
      incidentDate: source.incidentDate,
      tier: source.tier,
    },
    deterministicOutputs,
    // Each document keeps its own id so the model can attribute a statement to a source
    // instead of one flattened blob with no way to tell evidence apart.
    evidenceDocuments: (evidenceDocuments ?? []).slice(0, MAX_EVIDENCE_DOCUMENTS).map((document) => ({
      documentId: document.documentId,
      fileName: redactText(document.fileName, 200),
      text: redactText(document.text, MAX_EVIDENCE_CHARS_PER_DOCUMENT),
    })),
  };
}
