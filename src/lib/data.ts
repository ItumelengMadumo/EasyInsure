import { generateClient } from 'aws-amplify/data';
import { fetchAuthSession } from 'aws-amplify/auth';
import { uploadData } from 'aws-amplify/storage';
import type { Portfolio } from '../types';

export const client: any = generateClient();

// Reads every page; a bare list() stops at the first page and silently drops records.
async function listAll(model: any) {
  const data: any[] = [];
  let nextToken: string | null | undefined;
  do {
    const page = await model.list({ limit: 1000, nextToken });
    if (page.errors?.length) return { data, errors: page.errors };
    data.push(...(page.data ?? []));
    nextToken = page.nextToken;
  } while (nextToken);
  return { data, errors: [] };
}

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

// Uploads land in quarantine/{identityId}/{path}/; the server registers the document and
// only a malware-scanned copy is ever promoted to evidence/.
export async function uploadQuarantined(path: string, file: File) {
  if (file.size > 10 * 1024 * 1024 || !ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Documents must be PDF, JPEG or PNG and under 10 MB.');
  }
  const { identityId } = await fetchAuthSession();
  if (!identityId) throw new Error('Your session has expired. Please sign in again.');
  const safeName = file.name.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-120) || 'document';
  const objectKey = `quarantine/${identityId}/${path}/${crypto.randomUUID()}-${safeName}`;
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  await uploadData({ path: objectKey, data: file, options: { contentType: file.type } }).result;
  return { objectKey, checksum };
}
const values = (result: any) => result.data ?? [];
const firstError = (results: any[]) => results.flatMap((result) => result.errors ?? [])[0];

export async function loadPortfolio(groups: string[] = []): Promise<Portfolio> {
  const senior = groups.some((group) => ['senior_officer', 'superuser'].includes(group));
  const staff = groups.some((group) => group.includes('officer') || ['developer', 'superuser'].includes(group));

  if (staff && !senior) {
    const [result, profiles] = await Promise.all([
      client.queries.getAssignedCasePortfolio({}), listAll(client.models.UserProfile),
    ]);
    const baseError = firstError([result, profiles]);
    if (baseError) throw new Error(baseError.message);
    const caseData = (result.data ?? {}) as any;
    return {
      assets: caseData.assets ?? [], policies: caseData.policies ?? [], profiles: values(profiles),
      applications: [], premiumAssessments: [],
      claims: caseData.claims ?? [], documents: caseData.documents ?? [],
      assignments: caseData.assignments ?? [], activities: caseData.activities ?? [],
      communications: caseData.communications ?? [], internalNotes: caseData.internalNotes ?? [],
      claimAssessments: caseData.claimAssessments ?? [],
      profile: values(profiles)[0] ?? null,
    };
  }

  const [assets, policies, profiles, applications, premiumAssessments] = await Promise.all([
    listAll(client.models.Asset), listAll(client.models.Policy), listAll(client.models.UserProfile),
    listAll(client.models.PolicyApplication), listAll(client.models.PremiumAssessment),
  ]);
  const baseError = firstError([assets, policies, profiles, applications, premiumAssessments]);
  if (baseError) throw new Error(baseError.message);
  const requests = [
    listAll(client.models.Claim), listAll(client.models.ClaimDocument),
    listAll(client.models.ClaimAssignment), listAll(client.models.ClaimActivity),
    listAll(client.models.ClaimCommunication),
  ];
  if (senior) requests.push(listAll(client.models.ClaimInternalNote));
  if (senior) requests.push(listAll(client.models.ClaimAssessment));
  const [claims, documents, assignments, activities, communications, internalNotes, claimAssessments] = await Promise.all(requests);
  const error = firstError([claims, documents, assignments, activities, communications, ...(senior ? [internalNotes] : [])]);
  if (error) throw new Error(error.message);
  return {
    assets: values(assets), policies: values(policies), profiles: values(profiles),
    applications: values(applications), premiumAssessments: values(premiumAssessments),
    claims: values(claims), documents: values(documents), assignments: values(assignments),
    activities: values(activities), communications: values(communications),
    internalNotes: senior ? values(internalNotes) : [], claimAssessments: senior ? values(claimAssessments) : [],
    profile: values(profiles)[0] ?? null,
  };
}
