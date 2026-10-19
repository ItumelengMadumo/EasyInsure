// Audience-specific wording. Clients should never meet internal operations vocabulary.
import type { Access } from './roles';

const sentence = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());

export function copyFor(access: Access) {
  if (access.isClient) {
    return {
      overviewEyebrow: 'Your cover at a glance',
      claimsEyebrow: 'My claims',
      portfolioLabel: 'My claims',
      claimFilters: [
        { value: 'ALL', label: 'All my claims' }, { value: 'INFO_NEEDED', label: 'Waiting on you' },
        { value: 'ACTIVE', label: 'In progress' }, { value: 'PAID', label: 'Paid' }, { value: 'CLOSED', label: 'Closed' },
      ],
    };
  }
  return {
    overviewEyebrow: access.isDeveloper ? 'Developer diagnostics' : 'Operations overview',
    claimsEyebrow: access.isDeveloper ? 'Developer diagnostics' : access.isSenior ? 'Claims oversight' : 'Advisor portfolio',
    portfolioLabel: access.isSenior ? 'Total portfolio' : 'My portfolio',
    claimFilters: ['ALL', 'ASSIGNMENT_PENDING', 'VALIDATING', 'UNDER_ASSESSMENT', 'INFO_NEEDED', 'DECISION_PENDING', 'APPROVED', 'PAID', 'CLOSED']
      .map((value) => ({ value, label: value === 'ALL' ? 'All cases' : sentence(value) })),
  };
}
