// Company and regulatory details shown on the legal pages, the footer and the policy schedule.
// EVERY value marked [PLACEHOLDER] must be supplied by the business or its compliance adviser before
// launch. They are deliberately obvious so they cannot ship unnoticed, and nothing here is invented.
export const COMPANY = {
  tradingName: 'EasyInsure',
  legalName: '[PLACEHOLDER: registered company name and registration number]',
  fspNumber: '[PLACEHOLDER: FSP licence number]',
  underwriter: '[PLACEHOLDER: underwriting insurer name and licence number]',
  registeredAddress: '[PLACEHOLDER: registered address]',
  supportEmail: '[PLACEHOLDER: support email]',
  supportPhone: '[PLACEHOLDER: support phone number]',
  complaintsEmail: '[PLACEHOLDER: complaints email]',
  informationOfficer: '[PLACEHOLDER: Information Officer name and contact details]',
};

/** Bodies that receive complaints. Names are fixed; contact details must be confirmed by compliance. */
export const COMPLAINT_BODIES = [
  { name: 'Ombudsman for Short-term Insurance (OSTI)', note: '[PLACEHOLDER: confirm current contact details]' },
  { name: 'FAIS Ombud', note: '[PLACEHOLDER: confirm current contact details]' },
  { name: 'Information Regulator (for privacy complaints under POPIA)', note: '[PLACEHOLDER: confirm current contact details]' },
];

export const COOLING_OFF = '[PLACEHOLDER: cooling-off rights wording to be supplied by compliance]';
export const WORDING_SUMMARY = '[PLACEHOLDER: policy wording summary and link to the full wording for this version]';

const all = (): string[] => [...Object.values(COMPANY), COOLING_OFF, WORDING_SUMMARY, ...COMPLAINT_BODIES.map((item) => item.note)];
/** True while any legal detail is still a placeholder. The UI shows a visible notice until this is false. */
export const hasPlaceholders = () => all().some((value) => value.includes('[PLACEHOLDER'));
