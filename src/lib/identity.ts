import { fetchAuthSession, fetchUserAttributes, getCurrentUser } from 'aws-amplify/auth';
import { demoPersona, isDemo } from './demo/mode';

export type Identity = { userId: string; email: string; name: string; groups: string[] };

/** The signed-in user, or the chosen demo persona. Demo mode never calls Cognito. */
export async function getIdentity(): Promise<Identity> {
  if (isDemo()) {
    const persona = demoPersona();
    return { userId: persona.userId, email: persona.email, name: persona.name, groups: persona.groups };
  }
  const [user, session, attributes] = await Promise.all([getCurrentUser(), fetchAuthSession(), fetchUserAttributes()]);
  const raw = session.tokens?.accessToken.payload['cognito:groups'];
  return {
    userId: user.userId, email: String(attributes.email ?? '').trim(),
    name: String(attributes.name ?? attributes.preferred_username ?? '').trim(),
    groups: Array.isArray(raw) ? raw.map(String) : [],
  };
}
