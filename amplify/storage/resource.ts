import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'easyinsureEvidence',
  access: (allow) => ({
    'quarantine/{entity_id}/*': [allow.entity('identity').to(['read', 'write', 'delete'])],
    'evidence/{entity_id}/*': [
      allow.entity('identity').to(['read']),
      allow.groups(['junior_officer', 'intermediate_officer', 'senior_officer', 'superuser']).to(['read']),
    ],
    'extracted/*': [allow.groups(['junior_officer', 'intermediate_officer', 'senior_officer', 'superuser']).to(['read'])],
  }),
});
