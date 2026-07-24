import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { SQSHandler } from 'aws-lambda';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as never);
Amplify.configure(resourceConfig, libraryOptions);
const data: any = generateClient();

type WorkItem = { communicationId: string; claimId: string; channel: string; correlationId: string };
type AdapterResult = { state: 'SENT' | 'DISABLED'; provider: string; providerReference?: string };

const adapters: Record<string, (item: WorkItem) => Promise<AdapterResult>> = {
  EMAIL: async () => ({ state: 'DISABLED', provider: process.env.EMAIL_PROVIDER ?? 'UNCONFIGURED_EMAIL' }),
  SMS: async () => ({ state: 'DISABLED', provider: process.env.SMS_PROVIDER ?? 'UNCONFIGURED_SMS' }),
  WHATSAPP: async () => ({ state: 'DISABLED', provider: process.env.WHATSAPP_PROVIDER ?? 'UNCONFIGURED_WHATSAPP' }),
};

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const item = JSON.parse(record.body) as WorkItem;
    const adapter = adapters[item.channel];
    if (!adapter) throw new Error(`No adapter registered for ${item.channel}`);
    const attemptedAt = new Date().toISOString();
    const delivery = await data.models.CommunicationDelivery.create({
      communicationId: item.communicationId, claimId: item.claimId, channel: item.channel,
      provider: 'PENDING', state: 'QUEUED', attempts: 1, attemptedAt, correlationId: item.correlationId,
    });
    if (delivery.errors?.length || !delivery.data) throw new Error(delivery.errors?.[0]?.message ?? 'Delivery record failed');
    try {
      const result = await adapter(item);
      await Promise.all([
        data.models.CommunicationDelivery.update({
          id: delivery.data.id, provider: result.provider, state: result.state,
          providerReference: result.providerReference, completedAt: new Date().toISOString(),
        }),
        data.models.ClaimCommunication.update({
          id: item.communicationId, provider: result.provider, deliveryState: result.state,
          providerReference: result.providerReference, sentAt: result.state === 'SENT' ? new Date().toISOString() : undefined,
        }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Adapter failure';
      await Promise.all([
        data.models.CommunicationDelivery.update({
          id: delivery.data.id, state: 'FAILED', failureCategory: 'ADAPTER',
          failureMessage: message.slice(0, 500), completedAt: new Date().toISOString(),
        }),
        data.models.ClaimCommunication.update({ id: item.communicationId, deliveryState: 'FAILED' }),
      ]);
      throw error;
    }
  }
};
