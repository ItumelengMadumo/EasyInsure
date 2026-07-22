import { defineFunction } from '@aws-amplify/backend';

export const processClaim = defineFunction({
  name: 'process-claim-stage',
  entry: './handler.ts',
  timeoutSeconds: 60,
  memoryMB: 512,
  resourceGroupName: 'data',
});
