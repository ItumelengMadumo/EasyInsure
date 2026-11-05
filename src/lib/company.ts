// Company and regulatory details shown on the legal pages, the footer and the policy schedule.
// EVERY value marked [PLACEHOLDER] must be supplied by the business or its compliance adviser before
// launch. They are deliberately obvious so they cannot ship unnoticed, and nothing here is invented.
export const COMPANY = {
  tradingName: 'EasyInsure',
  legalName: 'Geeky Solutions (Pty) Ltd (registration number 2021/800172/07)',
  fspNumber: 'Not yet an authorised FSP — application in progress',
  underwriter: 'Not yet appointed — underwriting partner to be confirmed',
  registeredAddress: 'Krugersdorp, Gauteng, South Africa',
  supportEmail: 'Itu@geekysolutions.co.za',
  supportPhone: '063 782 8162',
  complaintsEmail: 'Itu@geekysolutions.co.za',
  informationOfficer: 'Itumeleng-Joas Madumo, Itu@geekysolutions.co.za',
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
