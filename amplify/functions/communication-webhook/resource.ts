import { defineFunction } from '@aws-amplify/backend';

export const communicationWebhook = defineFunction({
  name: 'communication-webhook',
  entry: './handler.ts',
  timeoutSeconds: 30,
  resourceGroupName: 'data',
});
