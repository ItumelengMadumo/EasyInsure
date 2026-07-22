import { defineFunction } from '@aws-amplify/backend';

export const claimsCommand = defineFunction({
  name: 'claims-command',
  entry: './handler.ts',
  timeoutSeconds: 30,
  resourceGroupName: 'data',
});
