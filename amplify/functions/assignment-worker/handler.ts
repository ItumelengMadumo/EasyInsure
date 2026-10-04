import { randomUUID } from 'node:crypto';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as never);
Amplify.configure(resourceConfig, libraryOptions);
const data: any = generateClient();
const cloudwatch = new CloudWatchClient({});

async function listAll(model: any, args: Record<string, unknown> = {}) {
  const items: any[] = [];
  let nextToken: string | null | undefined;
  do {
    const page = await model.list({ ...args, limit: 1000, nextToken });
    if (page.errors?.length) throw new Error(page.errors[0].message);
    items.push(...(page.data ?? []));
    nextToken = page.nextToken;
  } while (nextToken);
  return items;
}

// Only succeeds while the claim is still ASSIGNMENT_PENDING, so this worker and the
// submit-time auto-assignment can never both appoint a lead.
async function claimForAssignment(claimId: string, officer: string, assignedAt: string) {
  try {
    await data.graphql({
      query: `mutation Assign($input: UpdateClaimInput!, $condition: ModelClaimConditionInput) {
        updateClaim(input: $input, condition: $condition) { id } }`,
      variables: {
        input: { id: claimId, assignedOfficerId: officer, status: 'VALIDATING', currentMilestone: 'VALIDATING', lastActivityAt: assignedAt },
        condition: { status: { eq: 'ASSIGNMENT_PENDING' } },
      },
    });
    return true;
  } catch {
    return false;
  }
}

export const handler = async () => {
  const claims = await listAll(data.models.Claim, { filter: { status: { eq: 'ASSIGNMENT_PENDING' } } });
  const profiles = await listAll(data.models.UserProfile, { filter: { status: { eq: 'active' } } });
  const advisors = profiles.filter((profile: any) =>
    ['junior_officer', 'intermediate_officer', 'senior_officer'].includes(profile.businessRole));
  const activeAssignments = await listAll(data.models.ClaimAssignment, { filter: { active: { eq: true } } });
  const load = new Map<string, number>(advisors.map((profile: any) => [profile.owner, 0]));
  for (const assignment of activeAssignments) {
    if (load.has(assignment.userSubject)) load.set(assignment.userSubject, (load.get(assignment.userSubject) ?? 0) + 1);
  }
  let overdue = 0;
  let assigned = 0;
  for (const claim of claims) {
    if (claim.assignmentDueAt && new Date(claim.assignmentDueAt).getTime() < Date.now()) overdue += 1;
    if (!advisors.length) continue;
    const selected = [...advisors].sort((a: any, b: any) =>
      (load.get(a.owner) ?? 0) - (load.get(b.owner) ?? 0) || String(a.owner).localeCompare(String(b.owner)))[0];
    const assignedAt = new Date().toISOString();
    const correlationId = randomUUID();
    if (!(await claimForAssignment(claim.id, selected.owner, assignedAt))) continue;
    await data.models.ClaimAssignment.create({
      claimId: claim.id, claimOwner: claim.owner, userSubject: selected.owner,
      userDisplayNameSnapshot: selected.displayName ?? selected.email, userRoleSnapshot: selected.businessRole,
      assignmentRole: 'LEAD_ADVISOR', isLead: true, active: true, assignedAt,
      assignedBy: 'assignment-worker', correlationId,
    });
    await data.models.ClaimActivity.create({
      owner: claim.owner, claimId: claim.id, eventId: randomUUID(), eventType: 'ADVISOR_ASSIGNED',
      milestone: 'VALIDATING', actorSubject: 'assignment-worker',
      actorDisplayNameSnapshot: 'EasyInsure', actorRoleSnapshot: 'system',
      summary: `${selected.displayName ?? 'An advisor'} is now leading your claim.`,
      visibility: 'CLIENT_VISIBLE', occurredAt: assignedAt, correlationId,
    });
    load.set(selected.owner, (load.get(selected.owner) ?? 0) + 1);
    assigned += 1;
  }
  await cloudwatch.send(new PutMetricDataCommand({
    Namespace: 'EasyInsure',
    MetricData: [{ MetricName: 'AssignmentSlaBreaches', Value: overdue, Unit: 'Count', Timestamp: new Date() }],
  }));
  return { pending: claims.length, assigned, overdue };
};
