import { defineFunction } from '@aws-amplify/backend';

export const assignmentWorker = defineFunction({
  name: 'claim-assignment-worker',
  entry: './handler.ts',
  timeoutSeconds: 60,
  resourceGroupName: 'data',
});
