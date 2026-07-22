import { defineAuth } from '@aws-amplify/backend';
import { postConfirmation } from '../functions/post-confirmation/resource';

export const auth = defineAuth({
  loginWith: { email: true },
  userAttributes: {
    preferredUsername: { mutable: true, required: false },
  },
  groups: [
    'client',
    'junior_officer',
    'intermediate_officer',
    'senior_officer',
    'superuser',
  ],
  triggers: { postConfirmation },
});
