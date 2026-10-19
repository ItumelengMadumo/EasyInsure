export type LegalTopic = 'privacy' | 'terms' | 'complaints' | 'about';
export const LEGAL_TOPICS: { id: LegalTopic; label: string }[] = [
  { id: 'privacy', label: 'Privacy notice' }, { id: 'terms', label: 'Terms of use' },
  { id: 'complaints', label: 'Complaints' }, { id: 'about', label: 'About us and disclosures' },
];
