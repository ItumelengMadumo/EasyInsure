import { client, uploadQuarantined } from './data';

/** Uploads one file into quarantine and registers it against a claim. Throws with a readable message. */
export async function uploadClaimFile(claimId: string, file: File, category: string) {
  const { objectKey, checksum, mediaType } = await uploadQuarantined(`${claimId}`, file);
  const document = await client.mutations.registerClaimDocument({
    claimId, objectKey, fileName: file.name, mediaType, byteSize: file.size,
    checksum, category, correlationId: crypto.randomUUID(),
  });
  if (document.errors?.length) throw new Error(document.errors[0].message);
}

/** Uploads several files in order, stopping at the first failure so the user sees which one failed. */
export async function uploadClaimFiles(claimId: string, files: File[], category: string) {
  for (const file of files) {
    try { await uploadClaimFile(claimId, file, category); }
    catch (error) { throw new Error(`${file.name}: ${error instanceof Error ? error.message : 'upload failed'}`, { cause: error }); }
  }
}
