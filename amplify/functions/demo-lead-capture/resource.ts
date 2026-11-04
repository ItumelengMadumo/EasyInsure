import { defineFunction, secret } from '@aws-amplify/backend';

export const demoLeadCapture = defineFunction({
  name: 'demo-lead-capture',
  entry: './handler.ts',
  timeoutSeconds: 15,
  memoryMB: 256,
  environment: {
    SENDER_EMAIL: secret('DEMO_LEAD_SENDER_EMAIL'),
    NOTIFY_EMAIL: secret('DEMO_LEAD_NOTIFY_EMAIL'),
  },
  resourceGroupName: 'data',
});
