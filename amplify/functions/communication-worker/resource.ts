import { defineFunction } from '@aws-amplify/backend';

export const communicationWorker = defineFunction({
  name: 'communication-worker',
  entry: './handler.ts',
  timeoutSeconds: 30,
  resourceGroupName: 'data',
});
