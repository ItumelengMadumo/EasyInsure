import { generateClient } from 'aws-amplify/data';
import { fetchAuthSession } from 'aws-amplify/auth';
import { uploadData } from 'aws-amplify/storage';
import type { Portfolio } from '../types';
import { createDemoClient } from './demo/client';
import { ALLOWED_MEDIA_TYPES, MEDIA_TYPE_LABEL, maxBytesFor, resolveMediaType } from '../../amplify/functions/claims-command/domain';
import { isDemo } from './demo/mode';
import { roleFlags } from './roles';

// Demo mode swaps in an in-memory client so prospects can explore without an account or a backend.
export const client: any = isDemo() ? createDemoClient() : generateClient();

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

// Uploads land in quarantine/{identityId}/{path}/; the server registers the document and
// only a malware-scanned copy is ever promoted to evidence/.
export async function uploadQuarantined(path: string, file: File) {
  const mediaType = resolveMediaType(file.name, file.type);
  if (!ALLOWED_MEDIA_TYPES.includes(mediaType) || file.size > maxBytesFor(mediaType)) {
    throw new Error(`Files must be ${MEDIA_TYPE_LABEL}, up to ${maxBytesFor(mediaType) / 1024 / 1024} MB each.`);
  }
  if (isDemo()) return { objectKey: `demo/${crypto.randomUUID()}-${file.name}`, checksum: 'demo', mediaType };
  const { identityId } = await fetchAuthSession();
  if (!identityId) throw new Error('Your session has expired. Please sign in again.');
  const safeName = file.name.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-120) || 'document';
  const objectKey = `quarantine/${identityId}/${path}/${crypto.randomUUID()}-${safeName}`;
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  await uploadData({ path: objectKey, data: file, options: { contentType: mediaType } }).result;
  return { objectKey, checksum, mediaType };
}
const values = (result: any) => result.data ?? [];
const firstError = (results: any[]) => results.flatMap((result) => result.errors ?? [])[0];

/** AppSync returns a.json() fields as JSON strings; the UI wants objects. */
export function parseJson<T = any>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return null; }
}
const withTerms = (application: any) => ({ ...application, quoteTerms: parseJson(application.quoteTerms) });
const withFactors = (assessment: any) => ({ ...assessment, factors: parseJson(assessment.factors) ?? [] });
const withOutputs = (analysis: any) => ({ ...analysis, deterministicOutputs: parseJson(analysis.deterministicOutputs) });

export async function loadPortfolio(groups: string[] = []): Promise<Portfolio> {
  const { isSenior: senior, isStaff: staff } = roleFlags(groups);

  if (staff && !senior) {
    const [result, profiles] = await Promise.all([
      client.queries.getAssignedCasePortfolio({}), listAll(client.models.UserProfile),
    ]);
    const baseError = firstError([result, profiles]);
    if (baseError) throw new Error(baseError.message);
    const caseData = (result.data ?? {}) as any;
    // Officers can only list their own profile; the resolver adds the names of their clients.
    const known = new Set(values(profiles).map((item: any) => item.owner));
    const clients = (caseData.clientProfiles ?? []).filter((item: any) => !known.has(item.owner));
    return {
      assets: caseData.assets ?? [], policies: caseData.policies ?? [], profiles: [...values(profiles), ...clients],
      applications: [], premiumAssessments: [], analyses: [], jobs: caseData.jobs ?? [],
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
  if (senior) requests.push(listAll(client.models.ClaimAnalysis));
  const [claims, documents, assignments, activities, communications, internalNotes, claimAssessments, analyses] = await Promise.all(requests);
  const error = firstError([claims, documents, assignments, activities, communications, ...(senior ? [internalNotes] : [])]);
  if (error) throw new Error(error.message);
  return {
    assets: values(assets), policies: values(policies), profiles: values(profiles),
    applications: values(applications).map(withTerms), premiumAssessments: values(premiumAssessments).map(withFactors),
    claims: values(claims), documents: values(documents), assignments: values(assignments),
    activities: values(activities), communications: values(communications),
    internalNotes: senior ? values(internalNotes) : [], claimAssessments: senior ? values(claimAssessments) : [],
    analyses: senior ? values(analyses).map(withOutputs) : [], jobs: [],
    profile: values(profiles)[0] ?? null,
  };
}
