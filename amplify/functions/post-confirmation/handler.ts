import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } from '@aws-sdk/client-cognito-identity-provider';

const cognito = new CognitoIdentityProviderClient({});

export const handler: PostConfirmationTriggerHandler = async (event) => {
  // Self-service sign-up is deliberately fixed to the least-privileged group.
  await cognito.send(new AdminAddUserToGroupCommand({
    GroupName: 'client', UserPoolId: event.userPoolId, Username: event.userName,
  }));
  return event;
};
