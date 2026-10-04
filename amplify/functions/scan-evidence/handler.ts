import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import type { S3Event } from 'aws-lambda';
import { ALLOWED_MEDIA_TYPES, MAX_DOCUMENT_BYTES, matchesFileSignature, parseQuarantineKey } from '../claims-command/domain';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(process.env as never);
Amplify.configure(resourceConfig, libraryOptions);
const data: any = generateClient();
const s3 = new S3Client({});

// 'guardduty' (default): structural checks on upload, promotion only after GuardDuty
// Malware Protection reports NO_THREATS_FOUND. 'none' is for disposable sandboxes only.
const SCAN_MODE = process.env.MALWARE_SCAN_MODE === 'none' ? 'none' : 'guardduty';

type DocumentRecord = { id: string; objectKey: string; byteSize: number; checksum: string; mediaType: string; status: string };
type Located = { model: 'ClaimDocument' | 'ApplicationDocument'; document: DocumentRecord; evidenceKey: string };

type GuardDutyScanEvent = {
  source: 'aws.guardduty';
  detail: {
    s3ObjectDetails: { bucketName: string; objectKey: string };
    scanResultDetails: { scanResultStatus: string };
  };
};

// Uploads race the client's registration call, so the row may not exist yet when the
// S3 trigger fires. Short retries absorb that; after that we throw and let Lambda's
// async retry cover the rest.
async function locate(objectKey: string, retries = 4): Promise<Located | null> {
  const parsed = parseQuarantineKey(objectKey);
  if (!parsed) return null;
  const model = parsed.kind === 'claim' ? 'ClaimDocument' : 'ApplicationDocument';
  const evidenceKey = `evidence/${objectKey.slice('quarantine/'.length)}`;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const { data: documents, errors } = await data.models[model].list({ filter: { objectKey: { eq: objectKey } } });
    if (errors?.length) throw new Error(errors[0].message);
    const match = (documents as DocumentRecord[]).find((document) =>
      parsed.kind === 'claim' ? (document as any).claimId === parsed.parentId : (document as any).applicationId === parsed.parentId);
    if (match) return { model, document: match, evidenceKey };
    if (attempt < retries - 1) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  return null;
}

async function setStatus(located: Located, status: string, objectKey?: string) {
  const { errors } = await data.models[located.model].update({ id: located.document.id, status, ...(objectKey ? { objectKey } : {}) });
  if (errors?.length) throw new Error(errors[0].message);
}

async function discard(bucket: string, key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

async function promote(bucket: string, quarantineKey: string, located: Located) {
  await s3.send(new CopyObjectCommand({
    Bucket: bucket, Key: located.evidenceKey,
    CopySource: `${bucket}/${quarantineKey.split('/').map(encodeURIComponent).join('/')}`,
    MetadataDirective: 'COPY',
    // Drop GuardDuty's scan tags rather than copying them, which would need tagging permissions.
    TaggingDirective: 'REPLACE',
  }));
  await setStatus(located, 'CLEAN', located.evidenceKey);
  await discard(bucket, quarantineKey);
}

async function onUpload(bucket: string, objectKey: string) {
  if (!parseQuarantineKey(objectKey)) {
    // Not a recognised upload shape: nothing may reference it, so remove it.
    await discard(bucket, objectKey);
    return;
  }
  const located = await locate(objectKey);
  if (!located) throw new Error(`No document registration found for ${objectKey} after retries`);
  if (located.document.status !== 'QUARANTINED') return;

  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
  const bytes = await object.Body?.transformToByteArray();
  const valid = Boolean(bytes)
    && bytes!.byteLength === located.document.byteSize
    && bytes!.byteLength <= MAX_DOCUMENT_BYTES
    && createHash('sha256').update(bytes!).digest('hex') === located.document.checksum
    && ALLOWED_MEDIA_TYPES.includes(located.document.mediaType)
    && matchesFileSignature(bytes!, located.document.mediaType);

  if (!valid) {
    await setStatus(located, 'REJECTED');
    await discard(bucket, objectKey);
    return;
  }
  if (SCAN_MODE === 'none') {
    await promote(bucket, objectKey, located);
    return;
  }
  await setStatus(located, 'SCANNING');
}

async function onScanResult(event: GuardDutyScanEvent) {
  const { bucketName, objectKey } = event.detail.s3ObjectDetails;
  const located = await locate(objectKey, 2);
  if (!located) return;
  // GuardDuty can finish before the structural check marks the document SCANNING.
  if (located.document.status === 'QUARANTINED') await onUpload(bucketName, objectKey);
  const current = await locate(objectKey, 1);
  if (!current || current.document.status !== 'SCANNING') return;

  const verdict = event.detail.scanResultDetails.scanResultStatus;
  if (verdict === 'NO_THREATS_FOUND') {
    await promote(bucketName, objectKey, current);
  } else if (verdict === 'THREATS_FOUND') {
    await setStatus(current, 'REJECTED');
    await discard(bucketName, objectKey);
  } else {
    // UNSUPPORTED / ACCESS_DENIED / FAILED: keep the file quarantined for a human to review.
    await setStatus(current, 'FAILED');
  }
}

export const handler = async (event: S3Event | GuardDutyScanEvent) => {
  if ('source' in event && event.source === 'aws.guardduty') {
    await onScanResult(event);
    return;
  }
  for (const record of (event as S3Event).Records) {
    const objectKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    if (!objectKey.startsWith('quarantine/')) continue;
    await onUpload(record.s3.bucket.name, objectKey);
  }
};
