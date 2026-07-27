import { generateClient } from 'aws-amplify/data';
import type { Portfolio } from '../types';

const amplifyClient: any = generateClient();
type SimulationExecutor = (command: { kind: 'mutation' | 'model' | 'query'; operation: string; model?: string; args: Record<string, unknown> }) => Promise<any>;
let simulationExecutor: SimulationExecutor | null = null;
const mutationProxy = new Proxy(amplifyClient.mutations, {
  get(target, property) {
    return simulationExecutor
      ? (args: Record<string, unknown> = {}) => simulationExecutor!({ kind: 'mutation', operation: String(property), args })
      : Reflect.get(target, property);
  },
});
const modelsProxy = new Proxy(amplifyClient.models, {
  get(target, property) {
    const model = Reflect.get(target, property);
    if (!model || typeof model !== 'object') return model;
    return new Proxy(model, {
      get(modelTarget, operation) {
        if (simulationExecutor && ['create', 'update', 'delete'].includes(String(operation))) {
          return (args: Record<string, unknown> = {}) => simulationExecutor!({ kind: 'model', model: String(property), operation: String(operation), args });
        }
        return Reflect.get(modelTarget, operation);
      },
    });
  },
});
export const client: any = new Proxy(amplifyClient, {
  get(target, property) {
    if (property === 'mutations') return mutationProxy;
    if (property === 'models') return modelsProxy;
    if (property === 'queries' && simulationExecutor) {
      return new Proxy(amplifyClient.queries, {
        get(_target, operation) {
          return (args: Record<string, unknown> = {}) => simulationExecutor!({ kind: 'query', operation: String(operation), args });
        },
      });
    }
    return Reflect.get(target, property);
  },
});
export const setSimulationExecutor = (executor: SimulationExecutor | null) => { simulationExecutor = executor; };
export const isSimulationMode = () => Boolean(simulationExecutor);
const values = (result: any) => result.data ?? [];
const firstError = (results: any[]) => results.flatMap((result) => result.errors ?? [])[0];

export async function loadPortfolio(groups: string[] = []): Promise<Portfolio> {
  const senior = groups.some((group) => ['senior_officer', 'superuser'].includes(group));
  const staff = groups.some((group) => group.includes('officer') || ['developer', 'superuser'].includes(group));

  if (staff && !senior) {
    const [result, profiles] = await Promise.all([
      client.queries.getAssignedCasePortfolio({}), client.models.UserProfile.list({}),
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
    client.models.Asset.list({}), client.models.Policy.list({}), client.models.UserProfile.list({}),
    client.models.PolicyApplication.list({}), client.models.PremiumAssessment.list({}),
  ]);
  const baseError = firstError([assets, policies, profiles, applications, premiumAssessments]);
  if (baseError) throw new Error(baseError.message);
  const requests = [
    client.models.Claim.list({}), client.models.ClaimDocument.list({}),
    client.models.ClaimAssignment.list({}), client.models.ClaimActivity.list({}),
    client.models.ClaimCommunication.list({}),
  ];
  if (senior) requests.push(client.models.ClaimInternalNote.list({}));
  if (senior) requests.push(client.models.ClaimAssessment.list({}));
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
