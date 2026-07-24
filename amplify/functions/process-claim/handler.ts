import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as never);
Amplify.configure(resourceConfig, libraryOptions);
const data: any = generateClient();
const lambda = new LambdaClient({});

type State = { claimId: string; jobId: string; correlationId: string; context?: Record<string, unknown>; calculations?: Record<string, unknown>; copilot?: Record<string, unknown> };

async function invoke(functionName: string, payload: unknown) {
  const response = await lambda.send(new InvokeCommand({ FunctionName: functionName, InvocationType: 'RequestResponse', Payload: Buffer.from(JSON.stringify(payload)) }));
  if (response.FunctionError) throw new Error(`Downstream function failed: ${response.FunctionError}`);
  const decoded = JSON.parse(Buffer.from(response.Payload ?? []).toString('utf8'));
  return typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
}

async function updateJob(state: State, currentStep: string) {
  await data.models.ProcessingJob.update({ id: state.jobId, status: 'RUNNING', currentStep, startedAt: new Date().toISOString() });
}

export const handler = async (event: { stage: string; state: State }): Promise<State> => {
  const state = event.state;
  await updateJob(state, event.stage);

  if (event.stage === 'validate') {
    const [{ data: claim }, documents] = await Promise.all([
      data.models.Claim.get({ id: state.claimId }),
      data.models.ClaimDocument.list({ filter: { claimId: { eq: state.claimId } } }),
    ]);
    if (!claim || claim.status !== 'UNDER_ASSESSMENT') throw new Error('Claim is not under assessment');
    if (documents.data.some((document: { status: string }) => !['CLEAN', 'EXTRACTED'].includes(document.status))) throw new Error('Evidence scanning is incomplete');
    const [{ data: asset }, { data: policy }, previous] = await Promise.all([
      data.models.Asset.get({ id: claim.assetId }), data.models.Policy.get({ id: claim.policyId }),
      data.models.Claim.list({ filter: { owner: { eq: claim.owner } } }),
    ]);
    if (!asset || !policy) throw new Error('Claim asset or policy was not found');
    return { ...state, context: {
      claim, asset, policy,
      previousClaimDates: previous.data.filter((item: { id: string }) => item.id !== claim.id).map((item: { createdAt: string }) => item.createdAt),
      documentKeys: documents.data.map((item: { extractedTextKey?: string }) => item.extractedTextKey).filter(Boolean),
    } };
  }

  if (event.stage === 'calculate') {
    const context = state.context as { claim: Record<string, unknown>; asset: Record<string, unknown>; policy: Record<string, unknown>; previousClaimDates: string[] };
    const claim = context.claim; const asset = context.asset; const policy = context.policy;
    const engine = process.env.INSURANCE_ENGINE_FUNCTION_NAME;
    if (!engine) throw new Error('Insurance engine function is not configured');
    const call = (operation: string, payload: unknown) => invoke(engine, { arguments: { operation, payload } });
    const [tier, risk, fraud] = await Promise.all([
      call('assignTier', { amount: asset.purchasePrice }),
      call('calculateRisk', { assetType: asset.assetType, assetValue: asset.purchasePrice, previousClaimsCount: context.previousClaimDates.length }),
      call('detectFraud', { claimAmount: 0, assetValue: asset.purchasePrice, policyStartDate: policy.startDate, incidentDate: claim.incidentDate, previousClaimDates: context.previousClaimDates }),
    ]);
    return { ...state, calculations: { tier, risk, fraud } };
  }

  if (event.stage === 'copilot') {
    const functionName = process.env.CLAIMS_COPILOT_FUNCTION_NAME;
    if (!functionName) throw new Error('Claims copilot function is not configured');
    const claim = (state.context as { claim: unknown }).claim;
    const copilot = await invoke(functionName, { arguments: { claim, deterministicOutputs: state.calculations, evidenceText: '' } });
    return { ...state, copilot };
  }

  if (event.stage === 'persist') {
    const context = state.context as { claim: { status: string } };
    const calculations = state.calculations as { tier: { tier: number }; risk: { totalRiskScore: number }; fraud: { isFlagged: boolean; recommendation: string } };
    const copilot = state.copilot as { summary: string; recommendation: string; inconsistencies: string[]; missingInformation: string[]; modelId: string; promptVersion: string; confidence: number; warnings: string[]; latencyMs: number };
    const analysis = await data.models.ClaimAnalysis.create({
      claimId: state.claimId, version: 1, calculationInputs: state.context as never,
      deterministicOutputs: calculations as never, aiSummary: copilot.summary, recommendation: copilot.recommendation,
      inconsistencies: copilot.inconsistencies, missingInformation: copilot.missingInformation,
      modelId: copilot.modelId, promptVersion: copilot.promptVersion, confidence: copilot.confidence,
      warnings: copilot.warnings, latencyMs: copilot.latencyMs, inferenceStatus: 'SUCCEEDED',
    });
    if (analysis.errors?.length) throw new Error(analysis.errors[0].message);
    const claim = await data.models.Claim.update({
      id: state.claimId, status: 'UNDER_ASSESSMENT', currentMilestone: 'UNDER_ASSESSMENT', lastActivityAt: new Date().toISOString(), tier: calculations.tier.tier,
      riskScore: calculations.risk.totalRiskScore,
      fraudFlag: calculations.fraud.isFlagged, fraudReason: calculations.fraud.recommendation,
    });
    if (claim.errors?.length) throw new Error(claim.errors[0].message);
    await data.models.ClaimActivity.create({
      owner: (state.context as { claim: { owner: string } }).claim.owner,
      claimId: state.claimId, eventId: crypto.randomUUID(), eventType: 'INITIAL_REVIEW_COMPLETED',
      milestone: 'UNDER_ASSESSMENT', actorSubject: 'system', actorDisplayNameSnapshot: 'EasyInsure assessment service',
      actorRoleSnapshot: 'system', summary: 'Initial checks are complete. An assessor is reviewing the evidence and covered loss.',
      visibility: 'CLIENT_VISIBLE', occurredAt: new Date().toISOString(), correlationId: state.correlationId,
    });
    await data.models.ProcessingJob.update({ id: state.jobId, status: 'SUCCEEDED', currentStep: 'complete', completedAt: new Date().toISOString() });
    await data.models.AuditEvent.create({
      entityType: 'claim', entityId: state.claimId, action: 'analysis_completed', actorSubject: 'system',
      actorGroups: ['system'], previousValue: { status: context.claim.status } as never,
      newValue: { status: 'UNDER_ASSESSMENT', analysisId: analysis.data?.id, payoutPendingEvidenceReview: true } as never,
      correlationId: state.correlationId, occurredAt: new Date().toISOString(),
    });
    return state;
  }

  if (event.stage === 'failure') {
    const message = JSON.stringify((event as unknown as { workflowError?: unknown }).workflowError ?? 'Workflow failed').slice(0, 1000);
    await data.models.ProcessingJob.update({ id: state.jobId, status: 'FAILED', currentStep: 'failed', errorCategory: 'WORKFLOW', errorMessage: message, completedAt: new Date().toISOString() });
    await data.models.Claim.update({ id: state.claimId, status: 'FAILED' });
    return state;
  }

  throw new Error('Unknown processing stage');
};
