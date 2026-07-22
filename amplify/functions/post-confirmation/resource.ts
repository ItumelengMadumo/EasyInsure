import { defineFunction } from '@aws-amplify/backend';

export const postConfirmation = defineFunction({
  name: 'easyinsure-post-confirmation',
  entry: './handler.ts',
  resourceGroupName: 'auth',
});
