import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as never);
Amplify.configure(resourceConfig, libraryOptions);
const data: any = generateClient();

function verified(body: string, signature?: string) {
  const secret = process.env.COMMUNICATION_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  const left = Buffer.from(expected); const right = Buffer.from(signature.replace(/^sha256=/, ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const raw = event.body ?? '';
  if (!verified(raw, event.headers['x-easyinsure-signature'])) return { statusCode: 401, body: 'invalid signature' };
  const payload = JSON.parse(raw) as {
    eventType?: 'INBOUND_MESSAGE' | 'DELIVERY_STATUS';
    channel: string; provider: string; providerReference: string; claimNumber?: string;
    sender: string; recipients?: string[]; subject?: string; body: string; occurredAt?: string;
    deliveryState?: 'SENT' | 'DELIVERED' | 'FAILED';
  };
  if (!['EMAIL', 'SMS', 'WHATSAPP'].includes(payload.channel)) return { statusCode: 400, body: 'unsupported channel' };
  if (payload.eventType === 'DELIVERY_STATUS') {
    if (!payload.deliveryState) return { statusCode: 400, body: 'delivery state required' };
    const communications = await data.models.ClaimCommunication.list({ filter: { providerReference: { eq: payload.providerReference } } });
    const communication = communications.data[0];
    if (!communication) return { statusCode: 202, body: JSON.stringify({ matched: false }) };
    await data.models.ClaimCommunication.update({
      id: communication.id, deliveryState: payload.deliveryState,
      deliveredAt: payload.deliveryState === 'DELIVERED' ? new Date().toISOString() : undefined,
    });
    const deliveries = await data.models.CommunicationDelivery.list({ filter: { communicationId: { eq: communication.id } } });
    await Promise.all(deliveries.data.map((delivery: any) => data.models.CommunicationDelivery.update({
      id: delivery.id, state: payload.deliveryState, completedAt: new Date().toISOString(),
      failureCategory: payload.deliveryState === 'FAILED' ? 'PROVIDER_CALLBACK' : undefined,
    })));
    return { statusCode: 200, body: JSON.stringify({ matched: true }) };
  }
  const duplicate = await data.models.ClaimCommunication.list({ filter: { providerReference: { eq: payload.providerReference } } });
  if (duplicate.data[0]) return { statusCode: 200, body: JSON.stringify({ id: duplicate.data[0].id, duplicate: true }) };
  const correlationId = randomUUID(); const occurredAt = payload.occurredAt ?? new Date().toISOString();
  const claims = payload.claimNumber
    ? await data.models.Claim.list({ filter: { claimNumber: { eq: payload.claimNumber } } })
    : { data: [] };
  const claim = claims.data[0];
  if (!claim) {
    await data.models.InboundReconciliation.create({
      channel: payload.channel, provider: payload.provider, providerReference: payload.providerReference,
      senderSnapshot: payload.sender, subject: payload.subject, bodyPreview: payload.body.slice(0, 500),
      receivedAt: occurredAt, status: 'UNMATCHED', correlationId,
    });
    return { statusCode: 202, body: JSON.stringify({ matched: false }) };
  }
  const communication = await data.models.ClaimCommunication.create({
    owner: claim.owner, claimId: claim.id, channel: payload.channel, direction: 'INBOUND',
    subject: payload.subject, body: payload.body, senderSubject: payload.sender,
    senderDisplayNameSnapshot: payload.sender, senderRoleSnapshot: 'client',
    recipientSnapshots: payload.recipients ?? [], visibility: 'CLIENT_VISIBLE',
    provider: payload.provider, providerReference: payload.providerReference, deliveryState: 'DELIVERED',
    sentAt: occurredAt, deliveredAt: occurredAt, occurredAt, idempotencyKey: payload.providerReference, correlationId,
  });
  if (communication.errors?.length || !communication.data) return { statusCode: 500, body: 'persistence failed' };
  await data.models.ClaimActivity.create({
    owner: claim.owner, claimId: claim.id, eventId: randomUUID(), eventType: 'INBOUND_COMMUNICATION',
    milestone: claim.currentMilestone, actorSubject: payload.sender, actorDisplayNameSnapshot: payload.sender,
    actorRoleSnapshot: 'client', summary: `A ${payload.channel.toLowerCase()} reply was added to the case.`,
    visibility: 'CLIENT_VISIBLE', occurredAt, correlationId,
  });
  return { statusCode: 202, body: JSON.stringify({ matched: true, id: communication.data.id }) };
};
