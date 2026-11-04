import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as never);
Amplify.configure(resourceConfig, libraryOptions);
const data: any = generateClient();
const ses = new SESClient({});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KNOWN_ROLES = ['client', 'junior_officer', 'intermediate_officer', 'senior_officer', 'developer', 'superuser'];

function clean(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength);
}

export const handler = async (event: {
  arguments: { name: string; email: string; company?: string; role: string; source: string };
}) => {
  const name = clean(event.arguments.name, 200);
  const email = clean(event.arguments.email, 200);
  const company = event.arguments.company ? clean(event.arguments.company, 200) : undefined;
  const role = KNOWN_ROLES.includes(event.arguments.role) ? event.arguments.role : 'client';
  const source = clean(event.arguments.source, 60) || 'unknown';

  if (!name) throw new Error('A name is required.');
  if (!EMAIL.test(email)) throw new Error('A valid email address is required.');

  const capturedAt = new Date().toISOString();
  const { data: lead, errors } = await data.models.DemoLead.create({ name, email, company, role, source, capturedAt });
  if (errors?.length) throw new Error(errors[0].message);

  const sender = process.env.SENDER_EMAIL;
  const notify = process.env.NOTIFY_EMAIL;
  if (sender && notify) {
    // A failed notification should never fail the lead capture itself; the row is already saved.
    try {
      await ses.send(new SendEmailCommand({
        Source: sender,
        Destination: { ToAddresses: [notify] },
        Message: {
          Subject: { Data: `EasyInsure demo: ${name}${company ? ` (${company})` : ''}` },
          Body: { Text: { Data: `${name} <${email}>${company ? `\nCompany: ${company}` : ''}\nStarted the demo as: ${role}\nSource: ${source}\nAt: ${capturedAt}` } },
        },
      }));
    } catch { /* lead is saved; the admin console is the fallback view */ }
  }

  return lead;
};
