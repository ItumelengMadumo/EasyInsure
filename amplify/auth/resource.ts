import { defineAuth } from '@aws-amplify/backend';
import { postConfirmation } from '../functions/post-confirmation/resource';

export const auth = defineAuth({
  loginWith: { email: true },
  // Optional authenticator-app (TOTP) MFA that users can switch on from Profile & security.
  multifactor: { mode: 'OPTIONAL', totp: true },
  userAttributes: {
    preferredUsername: { mutable: true, required: false },
  },
  groups: [
    'client',
    'junior_officer',
    'intermediate_officer',
    'senior_officer',
    'developer',
    'superuser',
  ],
  triggers: { postConfirmation },
});
