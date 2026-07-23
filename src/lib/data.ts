import { generateClient } from 'aws-amplify/data';
import type { Portfolio } from '../types';

export const client: any = generateClient();

export async function loadPortfolio(): Promise<Portfolio> {
  const [assets, policies, claims, documents, profiles] = await Promise.all([
    client.models.Asset.list({}),
    client.models.Policy.list({}),
    client.models.Claim.list({}),
    client.models.ClaimDocument.list({}),
    client.models.UserProfile.list({}),
  ]);
  const errors = [assets, policies, claims, documents, profiles].flatMap((result) => result.errors ?? []);
  if (errors.length) throw new Error(errors[0].message);
  return {
    assets: assets.data ?? [],
    policies: policies.data ?? [],
    claims: claims.data ?? [],
    documents: documents.data ?? [],
    profile: profiles.data?.[0] ?? null,
  };
}
