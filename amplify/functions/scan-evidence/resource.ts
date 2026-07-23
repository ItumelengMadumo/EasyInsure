import { defineFunction } from '@aws-amplify/backend';

export const scanEvidence = defineFunction({
  name: 'scan-evidence',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 512,
  resourceGroupName: 'storage',
});
