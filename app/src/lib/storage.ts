import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Object storage for uploads. With S3_BUCKET set, files go to S3 (or any S3-compatible store via S3_ENDPOINT);
// otherwise to a local folder, which is enough for development and tests.
// Keys starting with "bundled/" are sample files shipped with the app in seed-assets/, so sample proposals work
// in every environment without uploading anything.

const BUCKET = process.env.S3_BUCKET?.trim();
const LOCAL_DIR = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.UPLOAD_DIR || ".uploads");
const BUNDLED_DIR = path.join(process.cwd(), "seed-assets");

let client: S3Client | null = null;
const s3 = () =>
  (client ??= new S3Client({
    region: process.env.S3_REGION || process.env.AWS_REGION || "us-east-1",
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
  }));

export const storageKind = () => (BUCKET ? "s3" : "local");

const localPath = (key: string) => {
  const p = path.resolve(LOCAL_DIR, key);
  if (!p.startsWith(LOCAL_DIR + path.sep)) throw new Error("bad key");
  return p;
};

export async function putObject(key: string, bytes: Uint8Array, contentType: string) {
  if (BUCKET) {
    await s3().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: bytes, ContentType: contentType }));
    return;
  }
  const p = localPath(key);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(p), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ p, bytes);
}

/** Where to send the browser for a file: a short-lived signed S3 URL, or null to serve the bytes from `readObject`. */
export async function signedUrl(key: string, opts: { name: string; contentType: string; download: boolean }) {
  if (!BUCKET || key.startsWith("bundled/")) return null;
  const disposition = `${opts.download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(opts.name)}`;
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: BUCKET, Key: key, ResponseContentDisposition: disposition, ResponseContentType: opts.contentType }),
    { expiresIn: 3600 },
  );
}

export async function readObject(key: string): Promise<Uint8Array | null> {
  try {
    if (key.startsWith("bundled/")) {
      const p = path.resolve(BUNDLED_DIR, key.slice("bundled/".length));
      if (!p.startsWith(BUNDLED_DIR + path.sep)) return null;
      return await readFile(p);
    }
    if (BUCKET) {
      const r = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      return r.Body ? await r.Body.transformToByteArray() : null;
    }
    return await readFile(/*turbopackIgnore: true*/ localPath(key));
  } catch {
    return null;
  }
}
