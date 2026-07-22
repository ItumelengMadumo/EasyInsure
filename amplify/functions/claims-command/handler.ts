import { randomUUID } from 'node:crypto';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as never);
Amplify.configure(resourceConfig, libraryOptions);
const client: any = generateClient();
const stepFunctions = new SFNClient({});

type ResolverEvent = {
  fieldName: string;
  arguments: Record<string, unknown>;
  identity?: { sub?: string; claims?: Record<string, unknown> };
};

function identity(event: ResolverEvent) {
  const subject = event.identity?.sub ?? String(event.identity?.claims?.sub ?? '');
  const raw = event.identity?.claims?.['cognito:groups'];
  const groups = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(',') : [];
  if (!subject) throw new Error('Authenticated subject is required');
  return { subject, groups };
}

function requireSenior(groups: string[]) {
  if (!groups.some((group) => ['senior_officer', 'superuser'].includes(group))) throw new Error('Senior officer access required');
}

async function audit(entityId: string, action: string, actorSubject: string, actorGroups: string[], previousValue: unknown, newValue: unknown, correlationId: string) {
  const { errors } = await client.models.AuditEvent.create({
    entityType: 'claim', entityId, action, actorSubject, actorGroups,
    previousValue: previousValue as never, newValue: newValue as never,
    correlationId, occurredAt: new Date().toISOString(),
  });
  if (errors?.length) throw new Error(`Audit write failed: ${errors[0].message}`);
}

export const handler = async (event: ResolverEvent) => {
  const { subject, groups } = identity(event);
  const args = event.arguments;
  const correlationId = String(args.correlationId || randomUUID());

  if (event.fieldName === 'submitClaim') {
    const key = String(args.idempotencyKey);
    const existing = await client.models.Claim.list({ filter: { idempotencyKey: { eq: key } } });
    if (existing.data[0]) return existing.data[0];
    const amount = Number(args.amountRequested);
    if (!Number.isFinite(amount) || amount < 0) throw new Error('amountRequested must be non-negative');
    const { data, errors } = await client.models.Claim.create({
      owner: subject, claimNumber: `CLM-${Date.now()}`, policyId: String(args.policyId), assetId: String(args.assetId),
      claimType: String(args.claimType), description: String(args.description), incidentDate: String(args.incidentDate),
      incidentLocation: args.incidentLocation ? String(args.incidentLocation) : undefined,
      amountRequested: amount, status: 'SUBMITTED', idempotencyKey: key,
    });
    if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'Claim creation failed');
    await audit(data.id, 'submitted', subject, groups, null, { status: data.status, amountRequested: amount }, correlationId);
    return data;
  }

  const claimId = String(args.claimId);
  const { data: claim, errors: getErrors } = await client.models.Claim.get({ id: claimId });
  if (getErrors?.length || !claim) throw new Error('Claim not found');

  if (event.fieldName === 'startClaimProcessing') {
    if (!groups.some((group) => ['junior_officer', 'intermediate_officer', 'senior_officer', 'superuser'].includes(group))) throw new Error('Officer access required');
    if (claim.status !== 'SUBMITTED' && claim.status !== 'FAILED') throw new Error('Claim cannot be started from its current state');
    const key = String(args.idempotencyKey);
    const prior = await client.models.ProcessingJob.list({ filter: { correlationId: { eq: key } } });
    if (prior.data[0]) return prior.data[0];
    const job = await client.models.ProcessingJob.create({ claimId, status: 'QUEUED', currentStep: 'queued', attempts: 0, correlationId: key });
    if (job.errors?.length || !job.data) throw new Error(job.errors?.[0]?.message ?? 'Job creation failed');
    await client.models.Claim.update({ id: claimId, status: 'PROCESSING' });
    const stateMachineArn = process.env.CLAIMS_STATE_MACHINE_ARN;
    if (!stateMachineArn) throw new Error('Claims workflow is not configured');
    const execution = await stepFunctions.send(new StartExecutionCommand({
      stateMachineArn, name: `claim-${claimId}-${key}`.replace(/[^A-Za-z0-9-_]/g, '').slice(0, 80),
      input: JSON.stringify({ claimId, jobId: job.data.id, correlationId }),
    }));
    await client.models.ProcessingJob.update({ id: job.data.id, executionArn: execution.executionArn });
    await audit(claimId, 'processing_started', subject, groups, { status: claim.status }, { status: 'PROCESSING', jobId: job.data.id }, correlationId);
    return { ...job.data, executionArn: execution.executionArn };
  }

  if (event.fieldName === 'approveClaim') {
    requireSenior(groups);
    if (claim.status !== 'REVIEW') throw new Error('Only claims in REVIEW can be approved');
    const payout = Number(args.approvedPayout);
    if (!Number.isFinite(payout) || payout < 0) throw new Error('approvedPayout must be non-negative');
    const previous = { status: claim.status, suggestedPayout: claim.suggestedPayout };
    const { data, errors } = await client.models.Claim.update({ id: claim.id, status: 'APPROVED', approvedPayout: payout, approvedBy: subject, approvalTimestamp: new Date().toISOString() });
    if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'Approval failed');
    await audit(claim.id, 'approved', subject, groups, previous, { status: data.status, approvedPayout: payout }, correlationId);
    return data;
  }

  if (event.fieldName === 'rejectClaim') {
    requireSenior(groups);
    if (claim.status !== 'REVIEW') throw new Error('Only claims in REVIEW can be rejected');
    const reason = String(args.reason || '').trim();
    if (reason.length < 5) throw new Error('A rejection reason is required');
    const previous = { status: claim.status, suggestedPayout: claim.suggestedPayout };
    const { data, errors } = await client.models.Claim.update({ id: claim.id, status: 'REJECTED', approvedPayout: 0, approvedBy: subject, approvalTimestamp: new Date().toISOString() });
    if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'Rejection failed');
    await audit(claim.id, 'rejected', subject, groups, previous, { status: data.status, reason }, correlationId);
    return data;
  }

  if (event.fieldName === 'assignOfficer') {
    if (!groups.some((group) => ['intermediate_officer', 'senior_officer', 'superuser'].includes(group))) throw new Error('Officer assignment access required');
    const assignedOfficerId = String(args.officerSubject);
    const { data, errors } = await client.models.Claim.update({ id: claim.id, assignedOfficerId });
    if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'Assignment failed');
    await audit(claim.id, 'assigned', subject, groups, { assignedOfficerId: claim.assignedOfficerId }, { assignedOfficerId }, correlationId);
    return data;
  }

  throw new Error('Unsupported claim command');
};
