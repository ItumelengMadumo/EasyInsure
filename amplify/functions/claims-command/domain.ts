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
