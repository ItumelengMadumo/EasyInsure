import { defineFunction, secret } from '@aws-amplify/backend';
import { BEDROCK_REGION } from '../../config/regions';

export const claimsCopilot = defineFunction({
  name: 'claims-copilot',
  entry: './handler.ts',
  timeoutSeconds: 60,
  memoryMB: 512,
  environment: {
    BEDROCK_MODEL_ID: secret('BEDROCK_MODEL_ID'),
    BEDROCK_REGION,
    PROMPT_VERSION: 'claims-copilot-v1',
  },
  resourceGroupName: 'data',
});
