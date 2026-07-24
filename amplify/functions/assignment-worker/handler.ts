import { randomUUID } from 'node:crypto';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as never);
Amplify.configure(resourceConfig, libraryOptions);
const data: any = generateClient();
const cloudwatch = new CloudWatchClient({});

export const handler = async () => {
  const claims = await data.models.Claim.list({ filter: { status: { eq: 'ASSIGNMENT_PENDING' } } });
  const profiles = await data.models.UserProfile.list({ filter: { status: { eq: 'active' } } });
  const advisors = profiles.data.filter((profile: any) =>
    ['junior_officer', 'intermediate_officer', 'senior_officer'].includes(profile.businessRole));
  let overdue = 0;
  for (const claim of claims.data) {
    if (claim.assignmentDueAt && new Date(claim.assignmentDueAt).getTime() < Date.now()) overdue += 1;
    if (!advisors.length) continue;
    const loads = await Promise.all(advisors.map(async (profile: any) => {
      const assignments = await data.models.ClaimAssignment.list({ filter: { userSubject: { eq: profile.owner }, active: { eq: true } } });
      return { profile, load: assignments.data.length };
    }));
    loads.sort((a, b) => a.load - b.load || String(a.profile.owner).localeCompare(String(b.profile.owner)));
    const selected = loads[0].profile; const assignedAt = new Date().toISOString(); const correlationId = randomUUID();
    await data.models.ClaimAssignment.create({
      claimId: claim.id, claimOwner: claim.owner, userSubject: selected.owner,
      userDisplayNameSnapshot: selected.displayName ?? selected.email, userRoleSnapshot: selected.businessRole,
      assignmentRole: 'LEAD_ADVISOR', isLead: true, active: true, assignedAt,
      assignedBy: 'assignment-worker', correlationId,
    });
    await data.models.Claim.update({
      id: claim.id, assignedOfficerId: selected.owner, status: 'VALIDATING',
      currentMilestone: 'VALIDATING', lastActivityAt: assignedAt,
    });
    await data.models.ClaimActivity.create({
      owner: claim.owner, claimId: claim.id, eventId: randomUUID(), eventType: 'ADVISOR_ASSIGNED',
      milestone: 'VALIDATING', actorSubject: selected.owner,
      actorDisplayNameSnapshot: selected.displayName ?? selected.email, actorRoleSnapshot: selected.businessRole,
      summary: `${selected.displayName ?? 'An advisor'} is now leading your claim.`,
      visibility: 'CLIENT_VISIBLE', occurredAt: assignedAt, correlationId,
    });
  }
  await cloudwatch.send(new PutMetricDataCommand({
    Namespace: 'EasyInsure',
    MetricData: [{ MetricName: 'AssignmentSlaBreaches', Value: overdue, Unit: 'Count', Timestamp: new Date() }],
  }));
  return { pending: claims.data.length, assigned: Math.min(claims.data.length, advisors.length ? claims.data.length : 0), overdue };
};
