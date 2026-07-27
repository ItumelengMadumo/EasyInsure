import { randomBytes } from 'node:crypto';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  CreateSecretCommand,
  PutSecretValueCommand,
  ResourceExistsException,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { personas } from '../../src/lib/personas';

if (process.env.EASYINSURE_ENV !== 'dev') {
  console.error('Refusing to seed personas unless EASYINSURE_ENV=dev.');
  process.exit(1);
}
const userPoolId = process.env.EASYINSURE_DEV_USER_POOL_ID?.trim();
if (!userPoolId) {
  console.error('Set EASYINSURE_DEV_USER_POOL_ID to the Cognito development user pool.');
  process.exit(1);
}

const region = process.env.AWS_REGION ?? 'us-east-1';
const secretId = process.env.EASYINSURE_PERSONA_SECRET_ID ?? 'easyinsure/dev/persona-credentials';
const cognito = new CognitoIdentityProviderClient({ region });
const secrets = new SecretsManagerClient({ region });
const credentials: Record<string, { email: string; password: string }> = {};

for (const persona of personas) {
  const password = `Ei!${randomBytes(18).toString('base64url')}9a`;
  try {
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: persona.testEmail,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: persona.testEmail },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'preferred_username', Value: persona.name },
      ],
    }));
  } catch (error) {
    if (!(error instanceof UsernameExistsException)) throw error;
  }
  await cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId, Username: persona.testEmail, Password: password, Permanent: true,
  }));
  await cognito.send(new AdminAddUserToGroupCommand({
    UserPoolId: userPoolId, Username: persona.testEmail, GroupName: persona.role,
  }));
  credentials[persona.role] = { email: persona.testEmail, password };
}

const SecretString = JSON.stringify(credentials);
try {
  await secrets.send(new CreateSecretCommand({
    Name: secretId,
    Description: 'Rotatable EasyInsure development persona credentials. Never expose to the frontend.',
    SecretString,
  }));
} catch (error) {
  if (!(error instanceof ResourceExistsException)) throw error;
  await secrets.send(new PutSecretValueCommand({ SecretId: secretId, SecretString }));
}

console.log(`Reconciled ${personas.length} development personas. Credentials rotated in Secrets Manager: ${secretId}`);
