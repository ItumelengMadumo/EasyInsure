import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import type { S3Handler } from 'aws-lambda';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as never);
Amplify.configure(resourceConfig, libraryOptions);
const data: any = generateClient();
const s3 = new S3Client({});

const QUARANTINE_PREFIX = 'quarantine/';
const ALLOWED_MEDIA_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

type ClaimDocument = { id: string; objectKey: string; byteSize: number; checksum: string; mediaType: string };

// Uploads race the client's own ClaimDocument.create call, so the row may not exist yet
// when this trigger fires. A few short retries absorb that; if it never appears we throw
// so S3/Lambda's built-in async-invocation retry covers the rest.
async function findDocument(claimId: string, objectKey: string): Promise<ClaimDocument | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: documents } = await data.models.ClaimDocument.list({ filter: { claimId: { eq: claimId } } });
    const match = documents.find((document: ClaimDocument) => document.objectKey === objectKey);
    if (match) return match;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  return null;
}

export const handler: S3Handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const objectKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    if (!objectKey.startsWith(QUARANTINE_PREFIX)) continue;

    const segments = objectKey.slice(QUARANTINE_PREFIX.length).split('/');
    if (segments.length < 3) continue;
    const [owner, claimId, ...rest] = segments;
    const suffix = rest.join('/');

    const document = await findDocument(claimId, objectKey);
    if (!document) throw new Error(`No ClaimDocument found for ${objectKey} after retries`);

    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
    const bodyBytes = await object.Body?.transformToByteArray();
    const contentType = object.ContentType ?? '';
    const checksum = bodyBytes ? createHash('sha256').update(bodyBytes).digest('hex') : null;

    const valid = bodyBytes
      && bodyBytes.byteLength === document.byteSize
      && checksum === document.checksum
      && contentType === document.mediaType
      && ALLOWED_MEDIA_TYPES.includes(contentType);

    if (!valid) {
      await data.models.ClaimDocument.update({ id: document.id, status: 'REJECTED' });
      continue;
    }

    const evidenceKey = `evidence/${owner}/${claimId}/${suffix}`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: evidenceKey, Body: bodyBytes, ContentType: contentType }));
    await data.models.ClaimDocument.update({ id: document.id, status: 'CLEAN', objectKey: evidenceKey });
  }
};
