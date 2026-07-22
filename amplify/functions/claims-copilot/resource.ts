import { defineFunction, secret } from '@aws-amplify/backend';

export const claimsCopilot = defineFunction({
  name: 'claims-copilot',
  entry: './handler.ts',
  timeoutSeconds: 60,
  memoryMB: 512,
  environment: {
    BEDROCK_MODEL_ID: secret('BEDROCK_MODEL_ID'),
    PROMPT_VERSION: 'claims-copilot-v1',
  },
  resourceGroupName: 'data',
});
