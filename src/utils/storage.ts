/**
 * Object storage for uploads and generated certificates.
 *
 * Railway containers get a fresh filesystem on every deploy, so anything written
 * to disk disappears while its database row survives. When S3 settings are present
 * files go to the bucket instead; without them everything falls back to local disk
 * so local development keeps working unchanged.
 *
 * The bucket is shared with other projects, so every key is namespaced.
 */
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

export const isStorageConfigured = Boolean(endpoint && bucket && accessKeyId && secretAccessKey);

/** Keeps this app's objects separate from anything else sharing the bucket. */
const KEY_PREFIX = 'spade-academy/';

/** How long a redirect to a private object stays valid. Long enough to watch a video through. */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 6;

const client = isStorageConfigured
    ? new S3Client({
        endpoint,
        region: process.env.S3_REGION || 'auto',
        credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    })
    : null;

/** Turns a stored path such as `/uploads/certificates/x.png` into its bucket key. */
export const storageKeyForPath = (uploadPath: string) =>
    `${KEY_PREFIX}${uploadPath.replace(/^\/+/, '')}`;

export async function putObject(uploadPath: string, body: Buffer, contentType?: string) {
    if (!client) throw new Error('Object storage is not configured');
    await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: storageKeyForPath(uploadPath),
        Body: body,
        ContentType: contentType,
    }));
}

export async function objectExists(uploadPath: string) {
    if (!client) return false;
    try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: storageKeyForPath(uploadPath) }));
        return true;
    } catch {
        return false;
    }
}

/** A temporary link the browser can follow directly, so video never streams through this server. */
export async function signedUrlFor(uploadPath: string) {
    if (!client) throw new Error('Object storage is not configured');
    return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: storageKeyForPath(uploadPath) }),
        { expiresIn: SIGNED_URL_TTL_SECONDS }
    );
}

export async function deleteObject(uploadPath: string) {
    if (!client) return;
    try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKeyForPath(uploadPath) }));
    } catch (error) {
        console.warn('[Storage] Failed to delete object:', uploadPath, error);
    }
}
